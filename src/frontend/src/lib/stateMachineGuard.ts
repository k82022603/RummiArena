/**
 * stateMachineGuard — S0~S10 전이 가드 (L3 순수 함수)
 *
 * SSOT 매핑:
 *   - 56b 전이 24개 1:1 구현
 *   - 56b §1: 상태 12개 (S0~S10 + TURN_END_RECEIVED)
 *   - 56b §2: 전이 다이어그램
 *   - 56b §3: invariant (위반 시 null 반환 → 호출자가 버그 처리)
 *
 * 금지: store, WS, DOM import 불가 (L3 계층 규칙)
 *
 * nextState() 반환값:
 *   - TurnState: 전이 성공
 *   - null: 해당 상태에서 해당 액션은 허용되지 않음 (호출자 버그)
 */

// ---------------------------------------------------------------------------
// 타입 정의 (58 §4.2 TurnStateStore 타입과 동기화)
// ---------------------------------------------------------------------------

export type TurnState =
  | "OUT_OF_TURN"             // S0
  | "MY_TURN_IDLE"            // S1
  | "DRAGGING_FROM_RACK"      // S2
  | "DRAGGING_FROM_PENDING"   // S3
  | "DRAGGING_FROM_SERVER"    // S4
  | "PENDING_BUILDING"        // S5
  | "PENDING_READY"           // S6
  | "COMMITTING"              // S7
  | "INVALID_RECOVER"         // S8
  | "DRAWING"                 // S9
  | "JOKER_RECOVERED"         // S10
  ;

export type TurnAction =
  | "TURN_START"           // S0↔S1 (isMyTurn으로 분기)
  | "DRAG_START_RACK"      // S1/S5/S6 → S2
  | "DRAG_START_PENDING"   // S5/S6 → S3
  | "DRAG_START_SERVER"    // S5/S6 → S4 (POST_MELD만)
  | "DROP_OK"              // S2/S3/S4 → S5
  | "DRAG_CANCEL"          // S2 → S1, S3/S4 → S5
  | "PRE_CHECK_PASS"       // S5 → S6
  | "PRE_CHECK_FAIL"       // S6 → S5
  | "CONFIRM"              // S6 → S7
  | "TURN_END_OK"          // S7 → S0 (TURN_END 수신)
  | "INVALID"              // S7 → S8
  | "RESET"                // S5/S6/S8/S10 → S1
  | "DRAW"                 // S1 → S9
  | "DRAW_OK"              // S9 → S0 (TURN_END 드로우 결과)
  | "JOKER_SWAP"           // S4 → S10
  | "JOKER_PLACED"         // S10 → S5
  | "GAME_OVER"            // * → S0 (terminal)
  ;

export interface TransitionContext {
  /** TURN_START 액션에서 내 턴인지 여부 (V-08) */
  isMyTurn?: boolean;
  /** DRAG_START_SERVER 액션에서 hasInitialMeld (V-13a) */
  hasInitialMeld?: boolean;
}

// ---------------------------------------------------------------------------
// 상태 전이 테이블 (56b §2 Mermaid stateDiagram-v2 1:1 매핑)
// ---------------------------------------------------------------------------

/**
 * 현재 상태와 액션으로 다음 상태를 계산한다.
 *
 * 56b 전이 24개를 exhaustive switch로 구현한다.
 *
 * @param current 현재 TurnState
 * @param action TurnAction
 * @param context 전이에 필요한 추가 컨텍스트 (isMyTurn 등)
 * @returns 다음 TurnState 또는 null (허용되지 않는 전이)
 */
export function nextState(
  current: TurnState,
  action: TurnAction,
  context: TransitionContext = {},
): TurnState | null {
  // GAME_OVER는 모든 상태에서 S0으로 (terminal)
  if (action === "GAME_OVER") return "OUT_OF_TURN";

  switch (current) {
    // ---- S0: OUT_OF_TURN ----
    case "OUT_OF_TURN":
      switch (action) {
        case "TURN_START":
          // isMyTurn=true → S1, false → S0 유지
          return context.isMyTurn === true ? "MY_TURN_IDLE" : "OUT_OF_TURN";
        default:
          return null;
      }

    // ---- S1: MY_TURN_IDLE ----
    case "MY_TURN_IDLE":
      switch (action) {
        case "TURN_START":
          // 다른 사람 TURN_START → S0
          return context.isMyTurn === true ? "MY_TURN_IDLE" : "OUT_OF_TURN";
        case "DRAG_START_RACK":
          return "DRAGGING_FROM_RACK";
        case "DRAW":
          return "DRAWING";
        default:
          return null;
      }

    // ---- S2: DRAGGING_FROM_RACK ----
    case "DRAGGING_FROM_RACK":
      switch (action) {
        case "DROP_OK":
          return "PENDING_BUILDING";
        case "DRAG_CANCEL":
          // S2에서 cancel → S1 (pending 없음) 또는 S5 (pending 있음)
          // 호출자가 pending 여부를 판단해서 사용해야 함
          // 여기서는 DRAG_CANCEL은 pending 없을 때 S1 기본값
          return "MY_TURN_IDLE";
        default:
          return null;
      }

    // ---- S3: DRAGGING_FROM_PENDING ----
    case "DRAGGING_FROM_PENDING":
      switch (action) {
        case "DROP_OK":
          return "PENDING_BUILDING";
        case "DRAG_CANCEL":
          return "PENDING_BUILDING";
        default:
          return null;
      }

    // ---- S4: DRAGGING_FROM_SERVER ----
    case "DRAGGING_FROM_SERVER":
      switch (action) {
        case "DROP_OK":
          return "PENDING_BUILDING";
        case "DRAG_CANCEL":
          return "PENDING_BUILDING";
        case "JOKER_SWAP":
          return "JOKER_RECOVERED";
        default:
          return null;
      }

    // ---- S5: PENDING_BUILDING ----
    case "PENDING_BUILDING":
      switch (action) {
        case "DRAG_START_RACK":
          return "DRAGGING_FROM_RACK";
        case "DRAG_START_PENDING":
          return "DRAGGING_FROM_PENDING";
        case "DRAG_START_SERVER":
          // V-13a: hasInitialMeld가 있어야만 서버 그룹 드래그 가능
          if (context.hasInitialMeld !== true) return null;
          return "DRAGGING_FROM_SERVER";
        case "PRE_CHECK_PASS":
          return "PENDING_READY";
        case "RESET":
          return "MY_TURN_IDLE";
        case "TURN_START":
          // 서버 강제 진행 (race condition)
          return context.isMyTurn === true ? "MY_TURN_IDLE" : "OUT_OF_TURN";
        default:
          return null;
      }

    // ---- S6: PENDING_READY ----
    case "PENDING_READY":
      switch (action) {
        case "DRAG_START_RACK":
          return "DRAGGING_FROM_RACK";
        case "DRAG_START_PENDING":
          return "DRAGGING_FROM_PENDING";
        case "DRAG_START_SERVER":
          if (context.hasInitialMeld !== true) return null;
          return "DRAGGING_FROM_SERVER";
        case "PRE_CHECK_FAIL":
          return "PENDING_BUILDING";
        case "CONFIRM":
          return "COMMITTING";
        case "RESET":
          return "MY_TURN_IDLE";
        case "TURN_START":
          return context.isMyTurn === true ? "MY_TURN_IDLE" : "OUT_OF_TURN";
        default:
          return null;
      }

    // ---- S7: COMMITTING ----
    case "COMMITTING":
      switch (action) {
        case "TURN_END_OK":
          return "OUT_OF_TURN";
        case "INVALID":
          return "INVALID_RECOVER";
        default:
          return null;
      }

    // ---- S8: INVALID_RECOVER ----
    case "INVALID_RECOVER":
      switch (action) {
        case "RESET":
          return "MY_TURN_IDLE";
        case "DROP_OK":
          // 재시도 (재드래그)
          return "PENDING_BUILDING";
        case "TURN_START":
          return context.isMyTurn === true ? "MY_TURN_IDLE" : "OUT_OF_TURN";
        default:
          return null;
      }

    // ---- S9: DRAWING ----
    case "DRAWING":
      switch (action) {
        case "DRAW_OK":
          return "OUT_OF_TURN";
        case "TURN_START":
          return context.isMyTurn === true ? "MY_TURN_IDLE" : "OUT_OF_TURN";
        default:
          return null;
      }

    // ---- S10: JOKER_RECOVERED ----
    case "JOKER_RECOVERED":
      switch (action) {
        case "JOKER_PLACED":
          return "PENDING_BUILDING";
        case "RESET":
          return "MY_TURN_IDLE";
        case "TURN_START":
          return context.isMyTurn === true ? "MY_TURN_IDLE" : "OUT_OF_TURN";
        default:
          return null;
      }

    default:
      // TypeScript exhaustiveness — never 도달해선 안 됨
      return null;
  }
}

/**
 * 주어진 상태에서 특정 액션이 허용되는지 확인한다.
 *
 * @param current 현재 TurnState
 * @param action TurnAction
 * @param context TransitionContext
 * @returns true = 허용, false = 불허
 */
export function canTransition(
  current: TurnState,
  action: TurnAction,
  context: TransitionContext = {},
): boolean {
  return nextState(current, action, context) !== null;
}
