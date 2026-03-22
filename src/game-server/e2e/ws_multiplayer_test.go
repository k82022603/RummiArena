// Package e2e contains end-to-end integration tests for the game-server.
// ws_multiplayer_test.go: WebSocket 멀티플레이어 완전 통합 테스트.
//
// 2명의 Human 플레이어가 WebSocket으로 실제 게임을 진행하는 시나리오를 검증한다.
// httptest.Server + gorilla/websocket 다이얼러를 사용하여 외부 의존성 없이 실행된다.
package e2e

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/k82022603/RummiArena/game-server/internal/handler"
)

// ============================================================
// wsTestClient — WebSocket 테스트 클라이언트
// ============================================================

// wsTestClient WebSocket 테스트 클라이언트.
// 연결 관리, 메시지 송수신, 타임아웃 처리를 캡슐화한다.
type wsTestClient struct {
	conn   *websocket.Conn
	t      *testing.T
	seat   int // AUTH_OK 수신 후 설정
	userID string

	mu      sync.Mutex
	pending []handler.WSMessage // 원하는 타입이 아닌 수신 메시지를 보관하는 버퍼
}

// newWSClient WebSocket 서버에 연결하는 테스트 클라이언트를 생성한다.
func newWSClient(t *testing.T, srv *httptest.Server, roomID string) *wsTestClient {
	t.Helper()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws?roomId=" + roomID
	dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}
	conn, _, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err, "WebSocket 연결 실패")

	return &wsTestClient{
		conn: conn,
		t:    t,
	}
}

// sendAuth AUTH 메시지를 전송한다.
func (c *wsTestClient) sendAuth(token string) {
	c.t.Helper()
	c.sendMsg(handler.C2SAuth, handler.AuthPayload{Token: token})
}

// sendMsg 타입과 페이로드로 WSEnvelope를 직렬화하여 전송한다.
func (c *wsTestClient) sendMsg(msgType string, payload interface{}) {
	c.t.Helper()

	rawPayload, err := json.Marshal(payload)
	require.NoError(c.t, err, "메시지 페이로드 직렬화 실패")

	env := handler.WSEnvelope{
		Type:      msgType,
		Payload:   rawPayload,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
	}
	err = c.conn.WriteJSON(env)
	require.NoError(c.t, err, "WebSocket 메시지 전송 실패: "+msgType)
}

// readMsg 다음 메시지를 읽는다 (타임아웃 3초).
func (c *wsTestClient) readMsg() handler.WSMessage {
	c.t.Helper()

	// 버퍼에 남은 메시지가 있으면 먼저 반환한다.
	c.mu.Lock()
	if len(c.pending) > 0 {
		msg := c.pending[0]
		c.pending = c.pending[1:]
		c.mu.Unlock()
		return msg
	}
	c.mu.Unlock()

	err := c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	require.NoError(c.t, err)

	var msg handler.WSMessage
	err = c.conn.ReadJSON(&msg)
	require.NoError(c.t, err, "WebSocket 메시지 읽기 실패")
	return msg
}

// readMsgOfType 특정 타입의 메시지가 올 때까지 읽는다 (최대 5초).
// 중간에 도착하는 다른 타입의 메시지는 내부 버퍼(pending)에 보관한다.
func (c *wsTestClient) readMsgOfType(msgType string) handler.WSMessage {
	c.t.Helper()

	deadline := time.Now().Add(5 * time.Second)

	for time.Now().Before(deadline) {
		// 버퍼에서 원하는 타입을 찾는다.
		c.mu.Lock()
		for i, m := range c.pending {
			if m.Type == msgType {
				c.pending = append(c.pending[:i], c.pending[i+1:]...)
				c.mu.Unlock()
				return m
			}
		}
		c.mu.Unlock()

		// 네트워크에서 다음 메시지를 읽는다.
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}
		err := c.conn.SetReadDeadline(time.Now().Add(remaining))
		if err != nil {
			c.t.Fatalf("SetReadDeadline 실패: %v", err)
		}

		var msg handler.WSMessage
		if err := c.conn.ReadJSON(&msg); err != nil {
			c.t.Fatalf("readMsgOfType(%s) 타임아웃 또는 연결 오류: %v", msgType, err)
		}

		if msg.Type == msgType {
			return msg
		}
		// 다른 타입이면 버퍼에 저장한다.
		c.mu.Lock()
		c.pending = append(c.pending, msg)
		c.mu.Unlock()
	}

	c.t.Fatalf("readMsgOfType(%s): 5초 내에 수신하지 못했다", msgType)
	return handler.WSMessage{}
}

// close WebSocket 연결을 정상 종료한다.
func (c *wsTestClient) close() {
	_ = c.conn.WriteMessage(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
	)
	_ = c.conn.Close()
}

// ============================================================
// 테스트 준비 헬퍼
// ============================================================

// wsGameSetup 2인 게임을 준비하고 방 ID, 게임 ID, 각 토큰을 반환한다.
// 방 생성 → 게스트 참가 → 게임 시작까지 HTTP로 처리한다.
func wsGameSetup(t *testing.T, srv *httptest.Server) (roomID, gameID, hToken, gToken string) {
	t.Helper()

	hToken = issueDevToken(t, hostUserID)
	gToken = issueDevToken(t, guestUserID)

	// 방 생성
	createResp := doRequest(t, srv, http.MethodPost, "/api/rooms", hToken, map[string]interface{}{
		"name":           "WS 통합 테스트 방",
		"playerCount":    2,
		"turnTimeoutSec": 60,
	})
	require.Equal(t, http.StatusCreated, createResp.StatusCode)
	createBody := decodeJSON(t, createResp)
	roomID = createBody["id"].(string)

	// 게스트 참가
	joinResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/join", gToken, nil)
	require.Equal(t, http.StatusOK, joinResp.StatusCode)
	joinResp.Body.Close() //nolint:errcheck

	// 게임 시작
	startResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/start", hToken, nil)
	require.Equal(t, http.StatusOK, startResp.StatusCode)
	startBody := decodeJSON(t, startResp)
	gameID = startBody["gameId"].(string)

	return roomID, gameID, hToken, gToken
}

// decodePayload WSMessage.Payload를 map으로 변환하는 헬퍼.
// Payload는 interface{}로 역직렬화되므로 json 재인코딩 후 map으로 변환한다.
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

// connectAndAuth WebSocket 연결 후 AUTH를 수신하고 AUTH_OK + GAME_STATE를 처리한다.
// AUTH_OK에서 seat을 클라이언트에 저장하고 GAME_STATE를 반환한다.
func connectAndAuth(t *testing.T, srv *httptest.Server, roomID, token string) (*wsTestClient, map[string]interface{}) {
	t.Helper()

	c := newWSClient(t, srv, roomID)
	c.sendAuth(token)

	// AUTH_OK 수신
	authOK := c.readMsg()
	require.Equal(t, handler.S2CAuthOK, authOK.Type, "첫 응답은 AUTH_OK여야 한다")
	authPayload := decodePayload(authOK.Payload)
	c.seat = int(authPayload["seat"].(float64))
	c.userID, _ = authPayload["userId"].(string)

	// GAME_STATE 수신 (게임이 시작된 상태)
	gameState := c.readMsg()
	require.Equal(t, handler.S2CGameState, gameState.Type, "AUTH_OK 직후 GAME_STATE가 와야 한다")
	gsPayload := decodePayload(gameState.Payload)

	return c, gsPayload
}

// ============================================================
// TestWSMultiplayer_AUTH_BothPlayersConnect
// ============================================================

// TestWSMultiplayer_AUTH_BothPlayersConnect 2명이 WebSocket 연결 시 AUTH_OK + GAME_STATE + PLAYER_JOIN 검증.
func TestWSMultiplayer_AUTH_BothPlayersConnect(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	roomID, _, hToken, gToken := wsGameSetup(t, srv)

	// host 연결 + 인증
	hostClient, hostGS := connectAndAuth(t, srv, roomID, hToken)
	defer hostClient.close()

	// guest 연결 + 인증 (host가 PLAYER_JOIN을 수신)
	guestClient, guestGS := connectAndAuth(t, srv, roomID, gToken)
	defer guestClient.close()

	// host는 guest 연결 시 PLAYER_JOIN을 수신한다.
	playerJoin := hostClient.readMsgOfType(handler.S2CPlayerJoin)
	joinPayload := decodePayload(playerJoin.Payload)

	// --- 검증 ---

	// seat 범위 및 충돌 없음
	assert.Contains(t, []int{0, 1}, hostClient.seat, "host seat은 0 또는 1이어야 한다")
	assert.Contains(t, []int{0, 1}, guestClient.seat, "guest seat은 0 또는 1이어야 한다")
	assert.NotEqual(t, hostClient.seat, guestClient.seat, "host와 guest의 seat은 달라야 한다")

	// 초기 랙 14장
	hostRack, ok := hostGS["myRack"].([]interface{})
	require.True(t, ok, "host GAME_STATE.myRack이 배열이어야 한다")
	assert.Equal(t, 14, len(hostRack), "host 초기 랙은 14장이어야 한다")

	guestRack, ok := guestGS["myRack"].([]interface{})
	require.True(t, ok, "guest GAME_STATE.myRack이 배열이어야 한다")
	assert.Equal(t, 14, len(guestRack), "guest 초기 랙은 14장이어야 한다")

	// PLAYER_JOIN 페이로드 검증
	assert.Equal(t, "HUMAN", joinPayload["playerType"], "PLAYER_JOIN.playerType은 HUMAN이어야 한다")
	assert.Equal(t, float64(guestClient.seat), joinPayload["seat"], "PLAYER_JOIN.seat이 guest seat과 일치해야 한다")
}

// ============================================================
// TestWSMultiplayer_DrawTile_Broadcast
// ============================================================

// TestWSMultiplayer_DrawTile_Broadcast 현재 턴 플레이어가 드로우하면 상대에게 브로드캐스트를 검증.
func TestWSMultiplayer_DrawTile_Broadcast(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	roomID, _, hToken, gToken := wsGameSetup(t, srv)

	hostClient, hostGS := connectAndAuth(t, srv, roomID, hToken)
	defer hostClient.close()

	guestClient, _ := connectAndAuth(t, srv, roomID, gToken)
	defer guestClient.close()

	// host가 guest 연결 시 보내는 PLAYER_JOIN을 소비한다.
	hostClient.readMsgOfType(handler.S2CPlayerJoin)

	// GAME_STATE에서 현재 턴 시트를 확인한다.
	currentSeat := int(hostGS["currentSeat"].(float64))

	// 현재 턴 플레이어와 상대를 선택한다.
	var turnClient, otherClient *wsTestClient
	if currentSeat == hostClient.seat {
		turnClient = hostClient
		otherClient = guestClient
	} else {
		turnClient = guestClient
		otherClient = hostClient
	}

	initialDrawPile := int(hostGS["drawPileCount"].(float64))

	// 현재 턴 플레이어가 DRAW_TILE을 전송한다.
	turnClient.sendMsg(handler.C2SDrawTile, struct{}{})

	// 본인의 TILE_DRAWN: drawnTile이 null이 아니어야 한다.
	ownDrawn := turnClient.readMsgOfType(handler.S2CTileDrawn)
	ownPayload := decodePayload(ownDrawn.Payload)
	assert.NotNil(t, ownPayload["drawnTile"], "본인의 TILE_DRAWN.drawnTile은 null이 아니어야 한다")

	// 상대의 TILE_DRAWN: drawnTile은 null이어야 한다.
	otherDrawn := otherClient.readMsgOfType(handler.S2CTileDrawn)
	otherPayload := decodePayload(otherDrawn.Payload)
	assert.Nil(t, otherPayload["drawnTile"], "상대의 TILE_DRAWN.drawnTile은 null이어야 한다 (타일 코드 비공개)")

	// 전원 TURN_END 수신
	turnEndHost := turnClient.readMsgOfType(handler.S2CTurnEnd)
	turnEndOther := otherClient.readMsgOfType(handler.S2CTurnEnd)
	turnEndPayload := decodePayload(turnEndHost.Payload)
	assert.Equal(t, "DRAW_TILE", turnEndPayload["action"], "TURN_END.action은 DRAW_TILE이어야 한다")
	_ = turnEndOther // 상대도 TURN_END를 수신했음을 확인

	// 전원 TURN_START 수신 (다음 턴)
	nextTurnStartTurn := turnClient.readMsgOfType(handler.S2CTurnStart)
	nextTurnStartOther := otherClient.readMsgOfType(handler.S2CTurnStart)
	nextTurnPayload := decodePayload(nextTurnStartTurn.Payload)

	// 턴이 상대방으로 넘어갔는지 확인한다.
	nextSeat := int(turnEndPayload["nextSeat"].(float64))
	assert.NotEqual(t, currentSeat, nextSeat, "드로우 후 턴은 다른 플레이어로 넘어가야 한다")
	assert.Equal(t, float64(nextSeat), nextTurnPayload["seat"], "TURN_START.seat이 nextSeat과 일치해야 한다")
	_ = nextTurnStartOther

	// 드로우 파일 감소 확인
	remainingDrawPile := int(ownPayload["drawPileCount"].(float64))
	assert.Less(t, remainingDrawPile, initialDrawPile, "드로우 후 drawPileCount가 감소해야 한다")
}

// ============================================================
// TestWSMultiplayer_PlaceTiles_InvalidMove
// ============================================================

// TestWSMultiplayer_PlaceTiles_InvalidMove 유효하지 않은 PLACE_TILES 전송 시 INVALID_MOVE 검증.
func TestWSMultiplayer_PlaceTiles_InvalidMove(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	roomID, _, hToken, gToken := wsGameSetup(t, srv)

	hostClient, hostGS := connectAndAuth(t, srv, roomID, hToken)
	defer hostClient.close()

	guestClient, _ := connectAndAuth(t, srv, roomID, gToken)
	defer guestClient.close()

	// host가 guest 연결 시 보내는 PLAYER_JOIN을 소비한다.
	hostClient.readMsgOfType(handler.S2CPlayerJoin)

	// 현재 턴 플레이어를 선택한다.
	currentSeat := int(hostGS["currentSeat"].(float64))
	var turnClient, otherClient *wsTestClient
	if currentSeat == hostClient.seat {
		turnClient = hostClient
		otherClient = guestClient
	} else {
		turnClient = guestClient
		otherClient = hostClient
	}

	// 유효하지 않은 배치: 타일 2개짜리 그룹 (최소 3개 필요)
	invalidPayload := handler.PlaceTilesPayload{
		TableGroups: []handler.WSTableGroup{
			{ID: "g1", Tiles: []string{"R1a", "B1a"}},
		},
		TilesFromRack: []string{"R1a", "B1a"},
	}
	turnClient.sendMsg(handler.C2SPlaceTiles, invalidPayload)

	// 본인에게 INVALID_MOVE 또는 ERROR가 전송된다.
	// (PLACE_TILES 실패는 서비스 에러로 반환될 수 있으므로 두 타입을 허용)
	var receivedErr bool
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		err := turnClient.conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		require.NoError(t, err)
		var msg handler.WSMessage
		if err := turnClient.conn.ReadJSON(&msg); err != nil {
			break
		}
		if msg.Type == handler.S2CInvalidMove || msg.Type == handler.S2CError {
			receivedErr = true
			if msg.Type == handler.S2CInvalidMove {
				p := decodePayload(msg.Payload)
				errs, ok := p["errors"].([]interface{})
				assert.True(t, ok, "INVALID_MOVE.errors가 배열이어야 한다")
				assert.Greater(t, len(errs), 0, "INVALID_MOVE.errors가 비어있지 않아야 한다")
			}
			break
		}
		// 다른 메시지는 버퍼에 저장
		turnClient.mu.Lock()
		turnClient.pending = append(turnClient.pending, msg)
		turnClient.mu.Unlock()
	}
	assert.True(t, receivedErr, "유효하지 않은 배치 시 오류 메시지가 전송되어야 한다")

	// 상대는 INVALID_MOVE를 받지 않는다 — 소비되지 않은 메시지 없음 확인
	otherClient.conn.SetReadDeadline(time.Now().Add(300 * time.Millisecond)) //nolint:errcheck
	var unexpectedMsg handler.WSMessage
	err := otherClient.conn.ReadJSON(&unexpectedMsg)
	// 타임아웃(read deadline 초과) 또는 EOF여야 정상
	if err == nil {
		// 상대에게 도착한 메시지는 게임 관련 정보성 메시지일 수 있음 (GAME_STATE 등)
		// INVALID_MOVE만 받지 않으면 된다
		assert.NotEqual(t, handler.S2CInvalidMove, unexpectedMsg.Type,
			"상대에게 INVALID_MOVE가 전송되어서는 안 된다")
	}
}

// ============================================================
// TestWSMultiplayer_Chat_Broadcast
// ============================================================

// TestWSMultiplayer_Chat_Broadcast 채팅 전송 시 전체 브로드캐스트를 검증.
func TestWSMultiplayer_Chat_Broadcast(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	roomID, _, hToken, gToken := wsGameSetup(t, srv)

	hostClient, _ := connectAndAuth(t, srv, roomID, hToken)
	defer hostClient.close()

	guestClient, _ := connectAndAuth(t, srv, roomID, gToken)
	defer guestClient.close()

	// host가 guest 연결 시 보내는 PLAYER_JOIN을 소비한다.
	hostClient.readMsgOfType(handler.S2CPlayerJoin)

	const chatMsg = "안녕하세요"

	// host가 채팅을 전송한다.
	hostClient.sendMsg(handler.C2SChat, handler.ChatPayload{Message: chatMsg})

	// host 자신도 CHAT_BROADCAST를 수신한다.
	hostBroadcast := hostClient.readMsgOfType(handler.S2CChatBroadcast)
	hostChatPayload := decodePayload(hostBroadcast.Payload)

	// guest도 CHAT_BROADCAST를 수신한다.
	guestBroadcast := guestClient.readMsgOfType(handler.S2CChatBroadcast)
	guestChatPayload := decodePayload(guestBroadcast.Payload)

	// --- 검증 ---
	assert.Equal(t, chatMsg, hostChatPayload["message"], "host의 CHAT_BROADCAST.message가 일치해야 한다")
	assert.Equal(t, chatMsg, guestChatPayload["message"], "guest의 CHAT_BROADCAST.message가 일치해야 한다")
	assert.NotEmpty(t, hostChatPayload["displayName"], "CHAT_BROADCAST.displayName이 비어있지 않아야 한다")
	assert.Equal(t, float64(hostClient.seat), hostChatPayload["seat"], "CHAT_BROADCAST.seat이 host seat과 일치해야 한다")
}

// ============================================================
// TestWSMultiplayer_Disconnect_Broadcast
// ============================================================

// TestWSMultiplayer_Disconnect_Broadcast guest 연결 끊기 시 host가 PLAYER_LEAVE를 수신하는지 검증.
func TestWSMultiplayer_Disconnect_Broadcast(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	roomID, _, hToken, gToken := wsGameSetup(t, srv)

	hostClient, _ := connectAndAuth(t, srv, roomID, hToken)
	defer hostClient.close()

	guestClient, _ := connectAndAuth(t, srv, roomID, gToken)

	// host가 guest 연결 시 보내는 PLAYER_JOIN을 소비한다.
	hostClient.readMsgOfType(handler.S2CPlayerJoin)

	guestSeat := guestClient.seat

	// guest 연결을 끊는다.
	guestClient.close()

	// host는 PLAYER_LEAVE를 수신해야 한다.
	playerLeave := hostClient.readMsgOfType(handler.S2CPlayerLeave)
	leavePayload := decodePayload(playerLeave.Payload)

	// --- 검증 ---
	assert.Equal(t, float64(guestSeat), leavePayload["seat"], "PLAYER_LEAVE.seat이 guest seat과 일치해야 한다")

	// reason은 "DISCONNECT" 또는 연결 종료를 나타내는 값이어야 한다.
	reason, _ := leavePayload["reason"].(string)
	assert.NotEmpty(t, reason, "PLAYER_LEAVE.reason이 비어있지 않아야 한다")
}

// ============================================================
// TestWSMultiplayer_Ping_Pong
// ============================================================

// TestWSMultiplayer_Ping_Pong PING 전송 시 PONG 수신을 검증.
func TestWSMultiplayer_Ping_Pong(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	roomID, _, hToken, _ := wsGameSetup(t, srv)

	hostClient, _ := connectAndAuth(t, srv, roomID, hToken)
	defer hostClient.close()

	// PING 전송
	hostClient.sendMsg(handler.C2SPing, struct{}{})

	// PONG 수신
	pong := hostClient.readMsgOfType(handler.S2CPong)
	pongPayload := decodePayload(pong.Payload)

	// --- 검증 ---
	serverTime, _ := pongPayload["serverTime"].(string)
	assert.NotEmpty(t, serverTime, "PONG.serverTime이 비어있지 않아야 한다")

	// RFC3339 형식 파싱 가능 여부 확인
	_, err := time.Parse(time.RFC3339Nano, serverTime)
	assert.NoError(t, err, "PONG.serverTime이 RFC3339 형식이어야 한다")
}

// ============================================================
// TestWSMultiplayer_FullTurnCycle
// ============================================================

// TestWSMultiplayer_FullTurnCycle 1턴 드로우 → 턴 전환 → 교착 판정(2번째 드로우) 흐름을 검증한다.
// 2인 게임에서 양측이 모두 1번씩 드로우하면 ConsecutivePassCount == 2 == len(players)이므로 교착이 발동한다.
// 1번째 드로우: TILE_DRAWN + TURN_END + TURN_START 정상 수신
// 2번째 드로우: GAME_OVER 수신 (교착 판정)
func TestWSMultiplayer_FullTurnCycle(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	roomID, _, hToken, gToken := wsGameSetup(t, srv)

	hostClient, hostGS := connectAndAuth(t, srv, roomID, hToken)
	defer hostClient.close()

	guestClient, _ := connectAndAuth(t, srv, roomID, gToken)
	defer guestClient.close()

	// host가 guest 연결 시 보내는 PLAYER_JOIN을 소비한다.
	hostClient.readMsgOfType(handler.S2CPlayerJoin)

	initialDrawPileCount := int(hostGS["drawPileCount"].(float64))
	currentSeat := int(hostGS["currentSeat"].(float64))

	// --- 1번째 드로우: 정상 턴 전환 검증 ---
	var turnClient, otherClient *wsTestClient
	if currentSeat == hostClient.seat {
		turnClient = hostClient
		otherClient = guestClient
	} else {
		turnClient = guestClient
		otherClient = hostClient
	}

	turnClient.sendMsg(handler.C2SDrawTile, struct{}{})

	// TILE_DRAWN 수신
	ownDrawn := turnClient.readMsgOfType(handler.S2CTileDrawn)
	ownDrawnPayload := decodePayload(ownDrawn.Payload)
	assert.NotNil(t, ownDrawnPayload["drawnTile"], "1번째 드로우: 본인의 drawnTile이 null이 아니어야 한다")

	otherDrawn := otherClient.readMsgOfType(handler.S2CTileDrawn)
	otherDrawnPayload := decodePayload(otherDrawn.Payload)
	assert.Nil(t, otherDrawnPayload["drawnTile"], "1번째 드로우: 상대의 drawnTile은 null이어야 한다")

	// TURN_END 수신
	turnEnd := turnClient.readMsgOfType(handler.S2CTurnEnd)
	turnEndPayload := decodePayload(turnEnd.Payload)
	_ = otherClient.readMsgOfType(handler.S2CTurnEnd)
	assert.Equal(t, "DRAW_TILE", turnEndPayload["action"])

	nextSeat := int(turnEndPayload["nextSeat"].(float64))
	assert.NotEqual(t, currentSeat, nextSeat, "드로우 후 턴이 다른 플레이어로 넘어가야 한다")

	// TURN_START 수신
	nextTurnStart := turnClient.readMsgOfType(handler.S2CTurnStart)
	nextTurnPayload := decodePayload(nextTurnStart.Payload)
	_ = otherClient.readMsgOfType(handler.S2CTurnStart)
	assert.Equal(t, float64(nextSeat), nextTurnPayload["seat"])

	// 1번 드로우 후 drawPileCount가 감소했는지 확인
	firstDrawPileCount := int(ownDrawnPayload["drawPileCount"].(float64))
	assert.Less(t, firstDrawPileCount, initialDrawPileCount,
		"드로우 후 drawPileCount(%d)가 초기값(%d)보다 작아야 한다", firstDrawPileCount, initialDrawPileCount)

	// --- 2번째 드로우: 교착 판정 발동 → GAME_OVER 수신 ---
	currentSeat = nextSeat
	if currentSeat == hostClient.seat {
		turnClient = hostClient
		otherClient = guestClient
	} else {
		turnClient = guestClient
		otherClient = hostClient
	}

	turnClient.sendMsg(handler.C2SDrawTile, struct{}{})

	// 교착 판정: TILE_DRAWN 없이 GAME_OVER 수신
	gameOver := turnClient.readMsgOfType(handler.S2CGameOver)
	gameOverPayload := decodePayload(gameOver.Payload)
	assert.NotNil(t, gameOverPayload, "교착 판정: GAME_OVER 페이로드가 있어야 한다")

	// 상대도 GAME_OVER 수신
	otherGameOver := otherClient.readMsgOfType(handler.S2CGameOver)
	assert.NotNil(t, decodePayload(otherGameOver.Payload))
}
