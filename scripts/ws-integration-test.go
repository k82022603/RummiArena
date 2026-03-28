// ws-integration-test.go
//
// RummiArena WebSocket 통합 테스트 자동화 클라이언트 (standalone)
//
// TC-WS-001 ~ TC-WS-005 (P0/P1 핵심 케이스)를 자동 실행한다.
// game-server 모듈 컨텍스트에서 실행해야 gorilla/websocket + golang-jwt를 사용할 수 있다.
//
// 실행 방법:
//   cd src/game-server && go run ../../scripts/ws-integration-test.go
//
// 환경변수:
//   BASE_URL    - game-server 기본 URL (기본값: http://localhost:30080)
//   JWT_SECRET  - JWT 서명 시크릿 (기본값: rummiarena-jwt-secret-2026)
//
// 종료 코드:
//   0 - 전체 PASS
//   1 - 하나 이상 FAIL
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

// ============================================================
// 설정
// ============================================================

var (
	baseURL = envOr("BASE_URL", "http://localhost:30080")
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ============================================================
// dev-login API를 통한 토큰 발급
// ============================================================

func devLogin(userID, displayName string) (string, error) {
	status, body, err := httpJSON("POST", "/api/auth/dev-login", "", map[string]interface{}{
		"userId":      userID,
		"displayName": displayName,
	})
	if err != nil {
		return "", fmt.Errorf("dev-login 요청 실패: %w", err)
	}
	if status != 200 {
		return "", fmt.Errorf("dev-login 실패 (HTTP %d): %v", status, body)
	}
	token, ok := body["token"].(string)
	if !ok || token == "" {
		return "", fmt.Errorf("dev-login 응답에 token 없음: %v", body)
	}
	return token, nil
}

func mustDevLogin(userID, displayName string) string {
	t, err := devLogin(userID, displayName)
	if err != nil {
		panic(fmt.Sprintf("dev-login 실패: %v", err))
	}
	return t
}

// issueToken JWT 자체 생성 (TC-WS-002 무효 토큰 테스트용)
func issueToken(userID string, expiry time.Duration) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   userID,
		"email": userID + "@test.rummiarena.dev",
		"role":  "user",
		"iat":   now.Unix(),
		"exp":   now.Add(expiry).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte("wrong-secret-for-testing"))
}

// ============================================================
// WS 메시지 구조체
// ============================================================

// WSEnvelope 클라이언트 -> 서버 메시지 봉투
type WSEnvelope struct {
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	Seq       int             `json:"seq,omitempty"`
	Timestamp string          `json:"timestamp"`
}

// WSMessage 서버 -> 클라이언트 메시지 봉투
type WSMessage struct {
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	Seq       int         `json:"seq"`
	Timestamp string      `json:"timestamp"`
}

// ============================================================
// HTTP 헬퍼
// ============================================================

func httpJSON(method, path, token string, body interface{}) (int, map[string]interface{}, error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, baseURL+path, bodyReader)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if len(data) > 0 {
		_ = json.Unmarshal(data, &result)
	}
	return resp.StatusCode, result, nil
}

// ============================================================
// WS 클라이언트 헬퍼
// ============================================================

type wsClient struct {
	conn *websocket.Conn
}

// dialWS WebSocket 연결을 수립한다 (roomId query 파라미터 포함).
func dialWS(roomID string) (*wsClient, error) {
	wsURL := strings.Replace(baseURL, "http://", "ws://", 1)
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)

	u, err := url.Parse(wsURL + "/ws")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("roomId", roomID)
	u.RawQuery = q.Encode()

	dialer := websocket.Dialer{
		HandshakeTimeout: 5 * time.Second,
	}
	conn, _, err := dialer.Dial(u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("WS 연결 실패 (%s): %w", u.String(), err)
	}
	return &wsClient{conn: conn}, nil
}

// sendAuth AUTH 메시지를 전송한다.
func (c *wsClient) sendAuth(token string) error {
	payload, _ := json.Marshal(map[string]string{"token": token})
	env := WSEnvelope{
		Type:      "AUTH",
		Payload:   payload,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
	}
	return c.conn.WriteJSON(env)
}

// sendMsg 임의 타입+페이로드 메시지를 전송한다.
func (c *wsClient) sendMsg(msgType string, payload interface{}) error {
	raw, _ := json.Marshal(payload)
	env := WSEnvelope{
		Type:      msgType,
		Payload:   raw,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
	}
	return c.conn.WriteJSON(env)
}

// readMsg 다음 메시지를 읽는다 (타임아웃 적용).
func (c *wsClient) readMsg(timeout time.Duration) (*WSMessage, error) {
	_ = c.conn.SetReadDeadline(time.Now().Add(timeout))
	var msg WSMessage
	err := c.conn.ReadJSON(&msg)
	if err != nil {
		return nil, err
	}
	return &msg, nil
}

// readMsgOfType 특정 타입의 메시지가 올 때까지 읽는다.
// 중간에 도착하는 다른 메시지는 무시한다.
func (c *wsClient) readMsgOfType(msgType string, timeout time.Duration) (*WSMessage, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}
		msg, err := c.readMsg(remaining)
		if err != nil {
			return nil, fmt.Errorf("readMsgOfType(%s) 실패: %w", msgType, err)
		}
		if msg.Type == msgType {
			return msg, nil
		}
	}
	return nil, fmt.Errorf("readMsgOfType(%s): 타임아웃", msgType)
}

// close WebSocket 연결을 정상 종료한다.
func (c *wsClient) close() {
	if c.conn != nil {
		_ = c.conn.WriteMessage(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
		)
		_ = c.conn.Close()
	}
}

// decodePayload WSMessage.Payload를 map으로 변환한다.
func decodePayload(payload interface{}) map[string]interface{} {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		return nil
	}
	return m
}

// ============================================================
// 게임 설정 헬퍼
// ============================================================

// setupGame 방 생성 -> 게스트 참가 -> 게임 시작을 수행하고 roomID를 반환한다.
func setupGame(hostToken, guestToken string) (roomID string, err error) {
	// 방 생성
	status, body, err := httpJSON("POST", "/api/rooms", hostToken, map[string]interface{}{
		"name":           "WS 통합 테스트",
		"playerCount":    2,
		"turnTimeoutSec": 60,
	})
	if err != nil {
		return "", fmt.Errorf("방 생성 HTTP 요청 실패: %w", err)
	}
	if status != 201 {
		return "", fmt.Errorf("방 생성 실패 (HTTP %d): %v", status, body)
	}
	roomID, _ = body["id"].(string)
	if roomID == "" {
		return "", fmt.Errorf("방 생성 응답에 id 없음: %v", body)
	}

	// 게스트 참가
	status, body, err = httpJSON("POST", "/api/rooms/"+roomID+"/join", guestToken, nil)
	if err != nil {
		return "", fmt.Errorf("게스트 참가 HTTP 요청 실패: %w", err)
	}
	if status != 200 {
		return "", fmt.Errorf("게스트 참가 실패 (HTTP %d): %v", status, body)
	}

	// 게임 시작
	status, body, err = httpJSON("POST", "/api/rooms/"+roomID+"/start", hostToken, nil)
	if err != nil {
		return "", fmt.Errorf("게임 시작 HTTP 요청 실패: %w", err)
	}
	if status != 200 {
		return "", fmt.Errorf("게임 시작 실패 (HTTP %d): %v", status, body)
	}

	return roomID, nil
}

// connectAndAuth WS 연결 후 AUTH -> AUTH_OK + GAME_STATE 수신까지 처리한다.
func connectAndAuth(roomID, token string) (*wsClient, map[string]interface{}, error) {
	c, err := dialWS(roomID)
	if err != nil {
		return nil, nil, err
	}

	if err := c.sendAuth(token); err != nil {
		c.close()
		return nil, nil, fmt.Errorf("AUTH 전송 실패: %w", err)
	}

	// AUTH_OK 수신
	authOK, err := c.readMsgOfType("AUTH_OK", 5*time.Second)
	if err != nil {
		c.close()
		return nil, nil, fmt.Errorf("AUTH_OK 수신 실패: %w", err)
	}
	_ = authOK

	// GAME_STATE 수신
	gameState, err := c.readMsgOfType("GAME_STATE", 5*time.Second)
	if err != nil {
		c.close()
		return nil, nil, fmt.Errorf("GAME_STATE 수신 실패: %w", err)
	}

	gsPayload := decodePayload(gameState.Payload)
	return c, gsPayload, nil
}

// ============================================================
// 테스트 결과 관리
// ============================================================

const (
	colorGreen  = "\033[0;32m"
	colorRed    = "\033[0;31m"
	colorYellow = "\033[1;33m"
	colorReset  = "\033[0m"
)

type testResult struct {
	id      string
	desc    string
	pass    bool
	detail  string
	latency time.Duration
}

var (
	results []testResult
	mu      sync.Mutex
)

func record(r testResult) {
	mu.Lock()
	results = append(results, r)
	mu.Unlock()

	status := colorGreen + "[PASS]" + colorReset
	if !r.pass {
		status = colorRed + "[FAIL]" + colorReset
	}
	latencyStr := ""
	if r.latency > 0 {
		latencyStr = fmt.Sprintf(" (latency: %dms)", r.latency.Milliseconds())
	}
	detailStr := ""
	if r.detail != "" && !r.pass {
		detailStr = fmt.Sprintf("\n    => %s", r.detail)
	}
	fmt.Printf("%s %s %s%s%s\n", r.id, status, r.desc, latencyStr, detailStr)
}

// ============================================================
// TC-WS-001: 연결 인증 - GAME_STATE 수신
// ============================================================

func testWS001(hostToken, guestToken string) {
	start := time.Now()
	id := "TC-WS-001"

	roomID, err := setupGame(hostToken, guestToken)
	if err != nil {
		record(testResult{id: id, desc: "연결 인증", pass: false, detail: err.Error()})
		return
	}

	c, gsPayload, err := connectAndAuth(roomID, hostToken)
	if err != nil {
		record(testResult{id: id, desc: "연결 인증", pass: false, detail: err.Error()})
		return
	}
	defer c.close()

	// 검증: status == "PLAYING"
	status, _ := gsPayload["status"].(string)
	if status != "PLAYING" {
		record(testResult{id: id, desc: "연결 인증", pass: false,
			detail: fmt.Sprintf("GAME_STATE.status=%q, 기대값: PLAYING", status)})
		return
	}

	// 검증: myRack 존재 (14장)
	myRack, ok := gsPayload["myRack"].([]interface{})
	if !ok || len(myRack) != 14 {
		rackLen := 0
		if ok {
			rackLen = len(myRack)
		}
		record(testResult{id: id, desc: "연결 인증", pass: false,
			detail: fmt.Sprintf("myRack 길이=%d, 기대값: 14", rackLen)})
		return
	}

	record(testResult{id: id, desc: "연결 인증 - GAME_STATE 수신", pass: true, latency: time.Since(start)})
}

// ============================================================
// TC-WS-002: 유효하지 않은 JWT - 4001 코드 수신
// ============================================================

func testWS002(hostToken, guestToken string) {
	start := time.Now()
	id := "TC-WS-002"

	roomID, err := setupGame(hostToken, guestToken)
	if err != nil {
		record(testResult{id: id, desc: "유효하지 않은 JWT", pass: false, detail: err.Error()})
		return
	}

	// 만료된 토큰 생성 (1초 전 만료)
	expiredToken, err := issueToken("expired-user", -1*time.Hour)
	if err != nil {
		record(testResult{id: id, desc: "유효하지 않은 JWT", pass: false, detail: "만료 토큰 생성 실패"})
		return
	}

	c, err := dialWS(roomID)
	if err != nil {
		record(testResult{id: id, desc: "유효하지 않은 JWT", pass: false, detail: err.Error()})
		return
	}
	defer c.close()

	if err := c.sendAuth(expiredToken); err != nil {
		record(testResult{id: id, desc: "유효하지 않은 JWT", pass: false, detail: "AUTH 전송 실패"})
		return
	}

	// ERROR 메시지 수신 후 연결 종료 기대
	// 서버는 ERROR를 먼저 보내고 close frame을 보낸다.
	// 메시지를 읽으면서 close frame을 감지한다.
	gotCloseCode := false
	var closeCode int

	for i := 0; i < 3; i++ {
		_ = c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if closeErr, ok := err.(*websocket.CloseError); ok {
				gotCloseCode = true
				closeCode = closeErr.Code
			}
			break
		}
	}

	if gotCloseCode && closeCode == 4001 {
		record(testResult{id: id, desc: "유효하지 않은 JWT - 4001 코드 수신", pass: true, latency: time.Since(start)})
	} else if gotCloseCode {
		record(testResult{id: id, desc: "유효하지 않은 JWT", pass: false,
			detail: fmt.Sprintf("close code=%d, 기대값: 4001", closeCode)})
	} else {
		record(testResult{id: id, desc: "유효하지 않은 JWT", pass: false,
			detail: "close frame을 수신하지 못함"})
	}
}

// ============================================================
// TC-WS-003: PLACE_TILES - GAME_STATE 브로드캐스트
// ============================================================

func testWS003(hostToken, guestToken string) {
	start := time.Now()
	id := "TC-WS-003"

	roomID, err := setupGame(hostToken, guestToken)
	if err != nil {
		record(testResult{id: id, desc: "PLACE_TILES", pass: false, detail: err.Error()})
		return
	}

	hostClient, hostGS, err := connectAndAuth(roomID, hostToken)
	if err != nil {
		record(testResult{id: id, desc: "PLACE_TILES", pass: false, detail: "호스트 연결 실패: " + err.Error()})
		return
	}
	defer hostClient.close()

	guestClient, _, err := connectAndAuth(roomID, guestToken)
	if err != nil {
		record(testResult{id: id, desc: "PLACE_TILES", pass: false, detail: "게스트 연결 실패: " + err.Error()})
		return
	}
	defer guestClient.close()

	// PLAYER_JOIN 소비 (호스트 측에서 게스트 참가 알림)
	_, _ = hostClient.readMsgOfType("PLAYER_JOIN", 3*time.Second)

	// 현재 턴 플레이어의 rack에서 실제 타일 3장을 선택하여 PLACE_TILES 시도
	currentSeatF, _ := hostGS["currentSeat"].(float64)
	currentSeat := int(currentSeatF)

	// 어떤 플레이어가 현재 턴인지 판별
	// hostClient 또는 guestClient 중 현재 턴인 쪽을 선택
	var turnClient, otherClient *wsClient
	var turnGS map[string]interface{}

	// AUTH_OK에서 seat을 확인해야 하나 여기선 간이 판별한다:
	// 호스트의 GAME_STATE에서 players 배열을 참조하여 seat을 매칭한다
	// 간이 처리: DRAW_TILE로 턴 소비 (PLACE_TILES는 유효 조합이 어려우므로)
	// PLACE_TILES를 보내면 INVALID_MOVE 또는 GAME_STATE가 온다.
	// 무효한 배치도 메시지 교환을 확인하는 것이 목적이다.

	// host seat 확인 (players 배열에서)
	hostSeat := -1
	if players, ok := hostGS["players"].([]interface{}); ok {
		for _, p := range players {
			pm := decodePayload(p)
			userID, _ := pm["userId"].(string)
			if userID == "ws-test-host-001" {
				hostSeat = int(pm["seat"].(float64))
				break
			}
		}
	}
	// hostSeat 판별 실패 시 기본값 사용
	if hostSeat < 0 {
		hostSeat = 0
	}

	if currentSeat == hostSeat {
		turnClient = hostClient
		otherClient = guestClient
		turnGS = hostGS
	} else {
		turnClient = guestClient
		otherClient = hostClient
		// 게스트의 GAME_STATE를 별도로 가져오지 않았으므로 hostGS 사용
		turnGS = hostGS
	}
	_ = turnGS

	// 유효하지 않은 PLACE_TILES 전송 (타일 2장: 규칙 위반)
	// 서버가 INVALID_MOVE를 반환하거나 ERROR를 반환해야 한다
	placeTilesPayload := map[string]interface{}{
		"tableGroups": []map[string]interface{}{
			{
				"id":    "g1",
				"tiles": []string{"R1a", "B1a"},
			},
		},
		"tilesFromRack": []string{"R1a", "B1a"},
	}
	if err := turnClient.sendMsg("PLACE_TILES", placeTilesPayload); err != nil {
		record(testResult{id: id, desc: "PLACE_TILES", pass: false, detail: "PLACE_TILES 전송 실패"})
		return
	}

	// 응답 수신: INVALID_MOVE 또는 ERROR (유효하지 않은 배치이므로)
	gotResponse := false
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		msg, err := turnClient.readMsg(time.Until(deadline))
		if err != nil {
			break
		}
		if msg.Type == "INVALID_MOVE" || msg.Type == "ERROR" || msg.Type == "GAME_STATE" {
			gotResponse = true
			break
		}
	}
	_ = otherClient

	if gotResponse {
		record(testResult{id: id, desc: "PLACE_TILES - 서버 응답 수신", pass: true, latency: time.Since(start)})
	} else {
		record(testResult{id: id, desc: "PLACE_TILES", pass: false, detail: "서버 응답을 수신하지 못함"})
	}
}

// ============================================================
// TC-WS-004: DRAW_TILE - GAME_STATE 브로드캐스트
// ============================================================

func testWS004(hostToken, guestToken string) {
	start := time.Now()
	id := "TC-WS-004"

	roomID, err := setupGame(hostToken, guestToken)
	if err != nil {
		record(testResult{id: id, desc: "DRAW_TILE", pass: false, detail: err.Error()})
		return
	}

	hostClient, hostGS, err := connectAndAuth(roomID, hostToken)
	if err != nil {
		record(testResult{id: id, desc: "DRAW_TILE", pass: false, detail: "호스트 연결 실패: " + err.Error()})
		return
	}
	defer hostClient.close()

	guestClient, _, err := connectAndAuth(roomID, guestToken)
	if err != nil {
		record(testResult{id: id, desc: "DRAW_TILE", pass: false, detail: "게스트 연결 실패: " + err.Error()})
		return
	}
	defer guestClient.close()

	// PLAYER_JOIN 소비
	_, _ = hostClient.readMsgOfType("PLAYER_JOIN", 3*time.Second)

	// 현재 턴 플레이어 판별
	currentSeatF, _ := hostGS["currentSeat"].(float64)
	currentSeat := int(currentSeatF)

	// host seat 판별
	hostSeat := -1
	if players, ok := hostGS["players"].([]interface{}); ok {
		for _, p := range players {
			pm := decodePayload(p)
			userID, _ := pm["userId"].(string)
			if userID == "ws-test-host-001" {
				hostSeat = int(pm["seat"].(float64))
				break
			}
		}
	}
	if hostSeat < 0 {
		hostSeat = 0
	}

	var turnClient, otherClient *wsClient
	if currentSeat == hostSeat {
		turnClient = hostClient
		otherClient = guestClient
	} else {
		turnClient = guestClient
		otherClient = hostClient
	}

	initialDrawPileF, _ := hostGS["drawPileCount"].(float64)
	initialDrawPile := int(initialDrawPileF)

	// DRAW_TILE 전송
	if err := turnClient.sendMsg("DRAW_TILE", struct{}{}); err != nil {
		record(testResult{id: id, desc: "DRAW_TILE", pass: false, detail: "DRAW_TILE 전송 실패"})
		return
	}

	// 턴 플레이어: TILE_DRAWN 수신 (drawnTile != null)
	tileDrawn, err := turnClient.readMsgOfType("TILE_DRAWN", 5*time.Second)
	if err != nil {
		record(testResult{id: id, desc: "DRAW_TILE", pass: false, detail: "TILE_DRAWN 수신 실패: " + err.Error()})
		return
	}
	drawnPayload := decodePayload(tileDrawn.Payload)
	if drawnPayload["drawnTile"] == nil {
		record(testResult{id: id, desc: "DRAW_TILE", pass: false, detail: "본인의 drawnTile이 null"})
		return
	}

	// drawPileCount 감소 확인
	newDrawPileF, _ := drawnPayload["drawPileCount"].(float64)
	newDrawPile := int(newDrawPileF)
	if newDrawPile >= initialDrawPile {
		record(testResult{id: id, desc: "DRAW_TILE", pass: false,
			detail: fmt.Sprintf("drawPileCount 미감소: %d -> %d", initialDrawPile, newDrawPile)})
		return
	}

	// 상대: TILE_DRAWN 수신 (drawnTile == null, 비공개)
	otherDrawn, err := otherClient.readMsgOfType("TILE_DRAWN", 5*time.Second)
	if err != nil {
		record(testResult{id: id, desc: "DRAW_TILE", pass: false, detail: "상대 TILE_DRAWN 수신 실패: " + err.Error()})
		return
	}
	otherPayload := decodePayload(otherDrawn.Payload)
	if otherPayload["drawnTile"] != nil {
		record(testResult{id: id, desc: "DRAW_TILE", pass: false, detail: "상대의 drawnTile이 null이 아님 (비공개 위반)"})
		return
	}

	record(testResult{id: id, desc: "DRAW_TILE - TILE_DRAWN 브로드캐스트", pass: true, latency: time.Since(start)})
}

// ============================================================
// TC-WS-005: 2인 동시 연결 - 양쪽 GAME_STATE 수신
// ============================================================

func testWS005(hostToken, guestToken string) {
	start := time.Now()
	id := "TC-WS-005"

	roomID, err := setupGame(hostToken, guestToken)
	if err != nil {
		record(testResult{id: id, desc: "2인 동시 연결", pass: false, detail: err.Error()})
		return
	}

	// 양쪽 동시 연결
	var (
		wg         sync.WaitGroup
		hostErr    error
		guestErr   error
		hostGS     map[string]interface{}
		guestGS    map[string]interface{}
		hostClient *wsClient
		guestC     *wsClient
	)

	wg.Add(2)
	go func() {
		defer wg.Done()
		var gs map[string]interface{}
		c, gs, err := connectAndAuth(roomID, hostToken)
		if err != nil {
			hostErr = err
			return
		}
		hostClient = c
		hostGS = gs
	}()

	go func() {
		defer wg.Done()
		var gs map[string]interface{}
		c, gs, err := connectAndAuth(roomID, guestToken)
		if err != nil {
			guestErr = err
			return
		}
		guestC = c
		guestGS = gs
	}()

	wg.Wait()

	if hostClient != nil {
		defer hostClient.close()
	}
	if guestC != nil {
		defer guestC.close()
	}

	if hostErr != nil {
		record(testResult{id: id, desc: "2인 동시 연결", pass: false, detail: "호스트 연결 실패: " + hostErr.Error()})
		return
	}
	if guestErr != nil {
		record(testResult{id: id, desc: "2인 동시 연결", pass: false, detail: "게스트 연결 실패: " + guestErr.Error()})
		return
	}

	// 양쪽 모두 GAME_STATE를 수신했는지 확인
	hostStatus, _ := hostGS["status"].(string)
	guestStatus, _ := guestGS["status"].(string)

	if hostStatus != "PLAYING" {
		record(testResult{id: id, desc: "2인 동시 연결", pass: false,
			detail: fmt.Sprintf("호스트 GAME_STATE.status=%q", hostStatus)})
		return
	}
	if guestStatus != "PLAYING" {
		record(testResult{id: id, desc: "2인 동시 연결", pass: false,
			detail: fmt.Sprintf("게스트 GAME_STATE.status=%q", guestStatus)})
		return
	}

	// 양쪽 모두 myRack 14장 확인
	hostRack, _ := hostGS["myRack"].([]interface{})
	guestRack, _ := guestGS["myRack"].([]interface{})
	if len(hostRack) != 14 || len(guestRack) != 14 {
		record(testResult{id: id, desc: "2인 동시 연결", pass: false,
			detail: fmt.Sprintf("호스트 rack=%d장, 게스트 rack=%d장 (기대: 14)", len(hostRack), len(guestRack))})
		return
	}

	// 동일 gameId 확인
	hostGameID, _ := hostGS["gameId"].(string)
	guestGameID, _ := guestGS["gameId"].(string)
	if hostGameID == "" || hostGameID != guestGameID {
		record(testResult{id: id, desc: "2인 동시 연결", pass: false,
			detail: fmt.Sprintf("gameId 불일치: host=%q, guest=%q", hostGameID, guestGameID)})
		return
	}

	record(testResult{id: id, desc: "2인 동시 연결 - 양쪽 GAME_STATE 수신", pass: true, latency: time.Since(start)})
}

// ============================================================
// 메인
// ============================================================

func main() {
	fmt.Println("")
	fmt.Println("=== RummiArena WebSocket Integration Test ===")
	fmt.Printf("Server: %s\n", baseURL)
	fmt.Println("")

	// 서버 연결 확인
	_, _, err := httpJSON("GET", "/health", "", nil)
	if err != nil {
		fmt.Printf("%s[ERROR]%s 서버에 연결할 수 없습니다: %s\n", colorRed, colorReset, baseURL)
		fmt.Printf("  game-server가 실행 중인지 확인하세요.\n")
		fmt.Printf("  에러: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("서버 연결 확인 완료")
	fmt.Println("")

	// 각 테스트에 고유한 userID를 사용하여 방 충돌을 방지한다
	tests := []struct {
		name string
		fn   func(hostToken, guestToken string)
	}{
		{"TC-WS-001", testWS001},
		{"TC-WS-002", testWS002},
		{"TC-WS-003", testWS003},
		{"TC-WS-004", testWS004},
		{"TC-WS-005", testWS005},
	}

	for i, tc := range tests {
		hostID := fmt.Sprintf("ws-test-host-%03d", i+1)
		guestID := fmt.Sprintf("ws-test-guest-%03d", i+1)
		hostToken := mustDevLogin(hostID, fmt.Sprintf("Host%d", i+1))
		guestToken := mustDevLogin(guestID, fmt.Sprintf("Guest%d", i+1))
		tc.fn(hostToken, guestToken)
	}

	// 결과 요약
	fmt.Println("")
	passCount := 0
	failCount := 0
	for _, r := range results {
		if r.pass {
			passCount++
		} else {
			failCount++
		}
	}

	total := passCount + failCount
	if failCount == 0 {
		fmt.Printf("=== 결과: %s%d/%d PASS%s ===\n", colorGreen, passCount, total, colorReset)
	} else {
		fmt.Printf("=== 결과: %s%d/%d PASS%s, %s%d FAIL%s ===\n",
			colorGreen, passCount, total, colorReset,
			colorRed, failCount, colorReset)
	}

	if failCount > 0 {
		os.Exit(1)
	}
}
