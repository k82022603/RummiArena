// ws_ai_turn_e2e.go
//
// RummiArena E2E Test: AI Turn Orchestrator (WS Level)
//
// Human(seat 0) + AI_LLAMA(seat 1) 2인 게임에서
// AI 플레이어가 실제로 턴을 자동 처리하는지 검증한다.
//
// 검증 시나리오:
//   1. REST: 방 생성 (AI_LLAMA + Rookie + easy) -> 게임 시작
//   2. WS: AUTH -> GAME_STATE(status=PLAYING) 수신
//   3. Human 턴이면 DRAW_TILE 전송
//   4. AI 턴이면 자동 처리 대기
//      - AI adapter 성공 시: TURN_END(action=PLACE_TILES or DRAW_TILE) 수신
//      - AI adapter 실패 시: forceAIDraw -> TILE_DRAWN + TURN_END 수신
//      - 2인 교착 시: GAME_OVER(STALEMATE) 수신 (Human+AI 각 1회 드로우)
//   5. 최소 1~3턴 진행 후 판정
//
// 실행:
//   cd src/game-server && go run /tmp/ws_ai_turn_e2e.go
//
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
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

// ============================================================
// 설정
// ============================================================

var (
	baseURL   = envOr("BASE_URL", "http://localhost:30080")
	jwtSecret = envOr("JWT_SECRET", "rummiarena-jwt-secret-2026")
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ============================================================
// 컬러/출력 상수
// ============================================================

const (
	colorGreen  = "\033[0;32m"
	colorRed    = "\033[0;31m"
	colorYellow = "\033[1;33m"
	colorCyan   = "\033[0;36m"
	colorReset  = "\033[0m"
)

// ============================================================
// JWT 생성
// ============================================================

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
	return token.SignedString([]byte(jwtSecret))
}

func mustIssueToken(userID string) string {
	t, err := issueToken(userID, 2*time.Hour)
	if err != nil {
		panic(fmt.Sprintf("JWT 생성 실패: %v", err))
	}
	return t
}

// ============================================================
// WS 메시지 구조체
// ============================================================

type WSEnvelope struct {
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	Seq       int             `json:"seq,omitempty"`
	Timestamp string          `json:"timestamp"`
}

type WSMessage struct {
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	Seq       int         `json:"seq"`
	Timestamp string      `json:"timestamp"`
}

// ============================================================
// 타임라인 로거
// ============================================================

type timelineEvent struct {
	elapsed time.Duration
	msgType string
	detail  string
}

var timeline []timelineEvent
var testStart time.Time

func logEvent(msgType, detail string) {
	elapsed := time.Since(testStart)
	timeline = append(timeline, timelineEvent{elapsed: elapsed, msgType: msgType, detail: detail})
	fmt.Printf("  %s[%6dms]%s %-20s %s\n",
		colorCyan, elapsed.Milliseconds(), colorReset,
		msgType, detail)
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
// WS 클라이언트
// ============================================================

type wsClient struct {
	conn *websocket.Conn
}

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
		return nil, fmt.Errorf("WS dial failed (%s): %w", u.String(), err)
	}
	return &wsClient{conn: conn}, nil
}

func (c *wsClient) sendAuth(token string) error {
	payload, _ := json.Marshal(map[string]string{"token": token})
	env := WSEnvelope{
		Type:      "AUTH",
		Payload:   payload,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
	}
	return c.conn.WriteJSON(env)
}

func (c *wsClient) sendMsg(msgType string, payload interface{}) error {
	raw, _ := json.Marshal(payload)
	env := WSEnvelope{
		Type:      msgType,
		Payload:   raw,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
	}
	return c.conn.WriteJSON(env)
}

func (c *wsClient) readMsg(timeout time.Duration) (*WSMessage, error) {
	_ = c.conn.SetReadDeadline(time.Now().Add(timeout))
	var msg WSMessage
	err := c.conn.ReadJSON(&msg)
	if err != nil {
		return nil, err
	}
	return &msg, nil
}

func (c *wsClient) readMsgOfType(msgType string, timeout time.Duration) (*WSMessage, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}
		msg, err := c.readMsg(remaining)
		if err != nil {
			return nil, fmt.Errorf("readMsgOfType(%s): %w", msgType, err)
		}
		if msg.Type == msgType {
			return msg, nil
		}
		logEvent(msg.Type, "(skipped while waiting for "+msgType+")")
	}
	return nil, fmt.Errorf("readMsgOfType(%s): timeout", msgType)
}

func (c *wsClient) close() {
	if c.conn != nil {
		_ = c.conn.WriteMessage(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
		)
		_ = c.conn.Close()
	}
}

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
// 검증 결과 트래커
// ============================================================

type checkResult struct {
	name   string
	pass   bool
	detail string
}

var checks []checkResult

func recordCheck(name string, pass bool, detail string) {
	checks = append(checks, checkResult{name: name, pass: pass, detail: detail})
	status := colorGreen + "[PASS]" + colorReset
	if !pass {
		status = colorRed + "[FAIL]" + colorReset
	}
	fmt.Printf("\n  %s %s", status, name)
	if detail != "" {
		fmt.Printf(" -- %s", detail)
	}
	fmt.Println("")
}

// ============================================================
// 메인 테스트 로직
// ============================================================

func main() {
	testStart = time.Now()

	fmt.Println("")
	fmt.Println("============================================================")
	fmt.Println("  RummiArena E2E Test: AI Turn Orchestrator (WS Level)")
	fmt.Println("  Human(seat 0) + AI_LLAMA(seat 1), 2-player game")
	fmt.Printf("  Server: %s\n", baseURL)
	fmt.Println("============================================================")
	fmt.Println("")

	// --------------------------------------------------------
	// 0. 서버 헬스 체크
	// --------------------------------------------------------
	_, _, err := httpJSON("GET", "/health", "", nil)
	if err != nil {
		fmt.Printf("%s[FATAL]%s Server unreachable: %v\n", colorRed, colorReset, err)
		os.Exit(1)
	}
	logEvent("HEALTH", "server OK")

	// --------------------------------------------------------
	// 1. JWT 생성
	// --------------------------------------------------------
	humanUserID := fmt.Sprintf("e2e-human-%d", time.Now().UnixMilli())
	humanToken := mustIssueToken(humanUserID)
	logEvent("JWT", fmt.Sprintf("humanUserID=%s", humanUserID))

	// --------------------------------------------------------
	// 2. POST /api/rooms -- Human + AI_LLAMA 2인
	//    turnTimeoutSec=120 으로 여유 있게 설정
	// --------------------------------------------------------
	createBody := map[string]interface{}{
		"name":           "E2E AI Turn Test",
		"playerCount":    2,
		"turnTimeoutSec": 120,
		"displayName":    "Human-E2E",
		"aiPlayers": []map[string]interface{}{
			{
				"type":            "AI_LLAMA",
				"persona":         "Rookie",
				"difficulty":      "easy",
				"psychologyLevel": 0,
			},
		},
	}

	status, body, err := httpJSON("POST", "/api/rooms", humanToken, createBody)
	if err != nil {
		fmt.Printf("%s[FATAL]%s Room creation HTTP error: %v\n", colorRed, colorReset, err)
		os.Exit(1)
	}
	if status != 201 {
		fmt.Printf("%s[FATAL]%s Room creation failed (HTTP %d): %v\n", colorRed, colorReset, status, body)
		os.Exit(1)
	}

	roomID, _ := body["id"].(string)
	if roomID == "" {
		fmt.Printf("%s[FATAL]%s No room id in response: %v\n", colorRed, colorReset, body)
		os.Exit(1)
	}
	logEvent("CREATE_ROOM", fmt.Sprintf("roomID=%s", roomID))

	// 방 플레이어 확인
	playersRaw, _ := body["players"].([]interface{})
	for _, p := range playersRaw {
		pm := decodePayload(p)
		seatF, _ := pm["seat"].(float64)
		pType, _ := pm["type"].(string)
		pName, _ := pm["displayName"].(string)
		logEvent("ROOM_PLAYER", fmt.Sprintf("seat=%d type=%s name=%s", int(seatF), pType, pName))
	}

	// --------------------------------------------------------
	// 3. POST /api/rooms/{id}/start
	// --------------------------------------------------------
	status, body, err = httpJSON("POST", "/api/rooms/"+roomID+"/start", humanToken, nil)
	if err != nil {
		fmt.Printf("%s[FATAL]%s Game start HTTP error: %v\n", colorRed, colorReset, err)
		os.Exit(1)
	}
	if status != 200 {
		fmt.Printf("%s[FATAL]%s Game start failed (HTTP %d): %v\n", colorRed, colorReset, status, body)
		os.Exit(1)
	}
	gameID, _ := body["gameId"].(string)
	logEvent("START_GAME", fmt.Sprintf("gameID=%s", gameID))

	// --------------------------------------------------------
	// 4. WS 연결 -> AUTH -> AUTH_OK + GAME_STATE
	// --------------------------------------------------------
	ws, err := dialWS(roomID)
	if err != nil {
		fmt.Printf("%s[FATAL]%s WS dial failed: %v\n", colorRed, colorReset, err)
		os.Exit(1)
	}
	defer ws.close()
	logEvent("WS_CONNECT", "dial OK")

	if err := ws.sendAuth(humanToken); err != nil {
		fmt.Printf("%s[FATAL]%s AUTH send failed: %v\n", colorRed, colorReset, err)
		os.Exit(1)
	}
	logEvent("WS_SEND", "AUTH")

	// AUTH_OK 수신
	authOK, err := ws.readMsgOfType("AUTH_OK", 5*time.Second)
	if err != nil {
		fmt.Printf("%s[FATAL]%s AUTH_OK not received: %v\n", colorRed, colorReset, err)
		os.Exit(1)
	}
	authPayload := decodePayload(authOK.Payload)
	mySeat := int(authPayload["seat"].(float64))
	logEvent("AUTH_OK", fmt.Sprintf("seat=%d", mySeat))

	// GAME_STATE 수신
	gameStateMsg, err := ws.readMsgOfType("GAME_STATE", 5*time.Second)
	if err != nil {
		fmt.Printf("%s[FATAL]%s GAME_STATE not received: %v\n", colorRed, colorReset, err)
		os.Exit(1)
	}
	gsPayload := decodePayload(gameStateMsg.Payload)

	gsStatus, _ := gsPayload["status"].(string)
	currentSeatF, _ := gsPayload["currentSeat"].(float64)
	currentSeat := int(currentSeatF)
	drawPileF, _ := gsPayload["drawPileCount"].(float64)
	drawPileCount := int(drawPileF)
	myRack, _ := gsPayload["myRack"].([]interface{})

	logEvent("GAME_STATE", fmt.Sprintf("status=%s currentSeat=%d drawPile=%d myRack=%d tiles",
		gsStatus, currentSeat, drawPileCount, len(myRack)))

	// ---- CHECK 1: GAME_STATE(status=PLAYING) ----
	recordCheck("CHECK-1: GAME_STATE(status=PLAYING) received",
		gsStatus == "PLAYING",
		fmt.Sprintf("status=%s", gsStatus))

	// --------------------------------------------------------
	// 5~7. 턴 루프
	//
	// 2인 교착 규칙: Human draw + AI draw = ConsecutivePassCount=2 -> STALEMATE
	// 따라서 AI adapter가 실패(forceAIDraw)하면 2턴만에 GAME_OVER가 발생한다.
	// 이 경우에도 AI 턴이 처리된 것으로 판정한다 (forceAIDraw는 유효한 AI 턴 처리).
	//
	// AI adapter가 정상 작동하면 place 성공 시 ConsecutivePassCount가 리셋되어
	// 더 많은 턴이 진행된다.
	// --------------------------------------------------------

	const maxWaitPerTurn = 120 * time.Second // AI_LLAMA Ollama latency (gemma3:4b ~40s)

	completedTurns := 0
	humanDrawCount := 0
	aiTurnCount := 0
	aiTurnProcessed := false // AI가 턴을 처리했다는 증거 (TURN_END 또는 GAME_OVER)
	var aiLatencies []time.Duration
	gameOver := false
	gameOverEndType := ""

	for !gameOver {
		if currentSeat == mySeat {
			// ---- Human 턴: DRAW_TILE ----
			logEvent("HUMAN_TURN", fmt.Sprintf("Turn %d: my turn (seat %d), sending DRAW_TILE",
				completedTurns+1, mySeat))

			if err := ws.sendMsg("DRAW_TILE", struct{}{}); err != nil {
				fmt.Printf("%s[FATAL]%s DRAW_TILE send error: %v\n", colorRed, colorReset, err)
				os.Exit(1)
			}

			// TILE_DRAWN 수신
			tileDrawnMsg, err := ws.readMsgOfType("TILE_DRAWN", 10*time.Second)
			if err != nil {
				fmt.Printf("%s[FATAL]%s TILE_DRAWN not received (human): %v\n", colorRed, colorReset, err)
				os.Exit(1)
			}
			tdPayload := decodePayload(tileDrawnMsg.Payload)
			drawnTile := "<nil>"
			if dt, ok := tdPayload["drawnTile"].(string); ok {
				drawnTile = dt
			}
			logEvent("TILE_DRAWN", fmt.Sprintf("drawnTile=%s drawPile=%v",
				drawnTile, tdPayload["drawPileCount"]))
			humanDrawCount++

			// 다음 메시지들 처리: TURN_END + TURN_START (또는 GAME_OVER)
			deadline := time.Now().Add(10 * time.Second)
			gotTurnEnd := false
			for time.Now().Before(deadline) {
				msg, err := ws.readMsg(time.Until(deadline))
				if err != nil {
					break
				}
				payload := decodePayload(msg.Payload)
				switch msg.Type {
				case "TURN_END":
					nextSeatF, _ := payload["nextSeat"].(float64)
					currentSeat = int(nextSeatF)
					logEvent("TURN_END", fmt.Sprintf("action=%v nextSeat=%d", payload["action"], currentSeat))
					gotTurnEnd = true

				case "TURN_START":
					logEvent("TURN_START", fmt.Sprintf("seat=%v playerType=%v", payload["seat"], payload["playerType"]))
					if gotTurnEnd {
						goto humanDone
					}

				case "GAME_OVER":
					gameOverEndType, _ = payload["endType"].(string)
					logEvent("GAME_OVER", fmt.Sprintf("endType=%s winnerSeat=%v", gameOverEndType, payload["winnerSeat"]))
					gameOver = true
					goto humanDone

				default:
					logEvent(msg.Type, "(during human turn end)")
				}
			}
		humanDone:
			completedTurns++

		} else {
			// ---- AI 턴: 자동 처리 대기 ----
			aiTurnStart := time.Now()
			logEvent("AI_TURN_WAIT", fmt.Sprintf("Turn %d: AI turn (seat %d), waiting...",
				completedTurns+1, currentSeat))

			// AI 턴 완료 시 가능한 메시지 순서:
			// 경로 A (forceAIDraw): TILE_DRAWN -> TURN_END -> TURN_START
			// 경로 B (place 성공):  TURN_END -> TURN_START
			// 경로 C (교착):        TILE_DRAWN -> GAME_OVER (또는 직접 GAME_OVER)
			// 경로 D (AI 승리):     TURN_END -> GAME_OVER

			gotAITurnEnd := false
			deadline := time.Now().Add(maxWaitPerTurn)

			for time.Now().Before(deadline) {
				remaining := time.Until(deadline)
				if remaining <= 0 {
					break
				}
				msg, err := ws.readMsg(remaining)
				if err != nil {
					fmt.Printf("%s[FATAL]%s Read error during AI turn: %v\n", colorRed, colorReset, err)
					os.Exit(1)
				}

				payload := decodePayload(msg.Payload)

				switch msg.Type {
				case "TILE_DRAWN":
					logEvent("TILE_DRAWN", fmt.Sprintf("(AI) seat=%v drawPile=%v",
						payload["seat"], payload["drawPileCount"]))
					aiTurnProcessed = true // AI가 드로우했다 = 턴이 처리된 증거

				case "TURN_END":
					aiLatency := time.Since(aiTurnStart)
					aiLatencies = append(aiLatencies, aiLatency)
					aiTurnCount++
					gotAITurnEnd = true
					aiTurnProcessed = true

					nextSeatF, _ := payload["nextSeat"].(float64)
					currentSeat = int(nextSeatF)
					logEvent("TURN_END", fmt.Sprintf("(AI) action=%v nextSeat=%d latency=%dms",
						payload["action"], currentSeat, aiLatency.Milliseconds()))

				case "TURN_START":
					logEvent("TURN_START", fmt.Sprintf("seat=%v playerType=%v",
						payload["seat"], payload["playerType"]))
					if gotAITurnEnd {
						goto aiDone
					}

				case "GAME_OVER":
					aiLatency := time.Since(aiTurnStart)
					if !gotAITurnEnd {
						// GAME_OVER가 TURN_END 없이 왔다 = 교착 또는 AI 승리
						aiLatencies = append(aiLatencies, aiLatency)
						aiTurnCount++
					}
					aiTurnProcessed = true
					gameOver = true

					gameOverEndType, _ = payload["endType"].(string)
					logEvent("GAME_OVER", fmt.Sprintf("(AI turn) endType=%s winnerSeat=%v latency=%dms",
						gameOverEndType, payload["winnerSeat"], aiLatency.Milliseconds()))
					goto aiDone

				case "GAME_STATE":
					logEvent("GAME_STATE", "(broadcast during AI turn)")

				default:
					logEvent(msg.Type, "(unexpected during AI turn)")
				}
			}

			if !gotAITurnEnd && !gameOver {
				recordCheck("AI turn completion",
					false,
					fmt.Sprintf("AI turn did not complete within %v", maxWaitPerTurn))
				goto report
			}

		aiDone:
			completedTurns++
		}

		// 안전 장치: 무한 루프 방지
		if completedTurns >= 20 {
			logEvent("SAFETY", "Max 20 turns reached, stopping")
			break
		}
	}

report:
	// ============================================================
	// 검증 결과
	// ============================================================

	fmt.Println("")
	fmt.Println("============================================================")
	fmt.Println("  Verification Results")
	fmt.Println("============================================================")

	// CHECK 1 이미 위에서 기록됨

	// ---- CHECK 2: Human DRAW_TILE 전송 -> TILE_DRAWN 수신 ----
	recordCheck("CHECK-2: Human DRAW_TILE -> TILE_DRAWN received",
		humanDrawCount > 0,
		fmt.Sprintf("%d human draws", humanDrawCount))

	// ---- CHECK 3: AI 자동 턴 처리 증거 ----
	// TURN_END 또는 GAME_OVER 중 하나라도 AI 턴에서 수신되면 PASS.
	// forceAIDraw -> GAME_OVER(STALEMATE)도 유효한 AI 턴 처리이다.
	check3Detail := fmt.Sprintf("%d AI turns via TURN_END", aiTurnCount)
	if gameOver && aiTurnProcessed && aiTurnCount == 0 {
		// GAME_OVER만 수신된 경우 (TURN_END 없이 교착 종료)
		check3Detail = fmt.Sprintf("AI turn -> GAME_OVER(%s) (forceAIDraw path)", gameOverEndType)
	}
	recordCheck("CHECK-3: AI auto-play broadcast received",
		aiTurnProcessed,
		check3Detail)

	// ---- CHECK 4: AI latency 측정 ----
	if len(aiLatencies) > 0 {
		var totalLatency time.Duration
		var maxLatency time.Duration
		for _, l := range aiLatencies {
			totalLatency += l
			if l > maxLatency {
				maxLatency = l
			}
		}
		avgLatency := totalLatency / time.Duration(len(aiLatencies))

		recordCheck("CHECK-4: AI turn latency measured",
			true,
			fmt.Sprintf("avg=%dms max=%dms count=%d", avgLatency.Milliseconds(), maxLatency.Milliseconds(), len(aiLatencies)))
	} else {
		recordCheck("CHECK-4: AI turn latency measured",
			false,
			"no AI latencies recorded")
	}

	// ============================================================
	// 요약
	// ============================================================

	fmt.Println("")
	fmt.Println("------------------------------------------------------------")
	fmt.Printf("  Turns completed : %d (human draws: %d, AI turns: %d)\n",
		completedTurns, humanDrawCount, aiTurnCount)
	if gameOver {
		fmt.Printf("  Game ended      : %s\n", gameOverEndType)
	}
	fmt.Printf("  Total test time : %dms\n", time.Since(testStart).Milliseconds())
	fmt.Println("------------------------------------------------------------")

	// 타임라인 출력
	fmt.Println("")
	fmt.Println("--- Message Flow Timeline ---")
	for _, ev := range timeline {
		fmt.Printf("  [%6dms] %-20s %s\n", ev.elapsed.Milliseconds(), ev.msgType, ev.detail)
	}
	fmt.Println("")

	// 최종 판정
	allPass := true
	for _, c := range checks {
		if !c.pass {
			allPass = false
		}
	}

	if allPass {
		fmt.Printf("=== %sALL CHECKS PASSED%s ===\n\n", colorGreen, colorReset)
	} else {
		fmt.Printf("=== %sSOME CHECKS FAILED%s ===\n\n", colorRed, colorReset)
		os.Exit(1)
	}
}
