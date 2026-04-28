"use client";

/**
 * GameRoom — 게임 화면 합성 루트 (L1)
 *
 * SSOT 매핑:
 *   - 58 §7 Phase 3: L1 컴포넌트 분리
 *   - 58 §1.1 To-Be 디렉터리 트리: GameRoom.tsx 역할
 *   - F-01: 내 턴 시작 인지 (useGameSync + useTurnStateStore)
 *   - F-02~F-06: 드래그 핸들러 (useDragHandlers)
 *   - F-09: ConfirmTurn (useTurnActions)
 *   - F-11: DRAW (useTurnActions)
 *
 * Phase 3 과도기 전략:
 *   GameClient.tsx의 기존 기능을 완전 보존하면서 Phase 2 hook을 활성화한다.
 *
 *   WS 브릿지 등록: GameClient 내부에서 registerWSSendBridge(send)를 호출한다.
 *   이 컴포넌트는 store/hook 활성화 컨테이너 역할만 수행하고
 *   렌더링은 GameClient에 위임한다.
 *
 *   GameClient가 자체 DndContext를 소유하므로 이 컴포넌트는 DndContext를 추가하지 않는다.
 *   Phase 4에서 GameClient의 DndContext를 이 컴포넌트로 이전한다.
 *
 *   P3 DndContext 이전 전제조건 (2026-04-28):
 *     1. P2b 완료 (handleDragEnd 전체 inline 분기 pendingStore dual-write)
 *     2. useTurnActions pendingStore.draft 전환 완료
 *     3. gameStore deprecated pending 필드 제거 완료
 *     4. useDragHandlers가 GameClient.handleDragEnd의 전체 기능을 대체
 *
 * 계층 규칙:
 *   - L2(store/hook)만 import. L3 순수 함수 직접 import 금지.
 *   - L4(WS) 직접 import 금지 — GameClient의 브릿지 경유.
 */

// L2 hooks
import { useDragHandlers } from "@/hooks/useDragHandlers";
import { useGameSync } from "@/hooks/useGameSync";
import { useInitialMeldGuard } from "@/hooks/useInitialMeldGuard";
import { useTurnTimer } from "@/hooks/useTurnTimer";

// L1 컴포넌트 (기존 보존)
import GameClient from "./GameClient";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GameRoomProps {
  roomId: string;
}

// ---------------------------------------------------------------------------
// GameRoom 컴포넌트
// ---------------------------------------------------------------------------

/**
 * 게임 화면 합성 루트.
 *
 * Phase 3 과도기:
 *   Phase 2 hook들을 마운트하여 store 상태(turnStateStore, pendingStore, dragStateStore)가
 *   올바르게 유지되도록 한다. 렌더링과 WS 연결은 GameClient에 위임한다.
 *
 * WS 브릿지:
 *   GameClient 내부에서 registerWSSendBridge(send)를 호출한다.
 *   이 컴포넌트는 브릿지 등록에 관여하지 않는다.
 *
 * store 상태 흐름:
 *   useGameSync → gameStore 변화 감지 → turnStateStore/pendingStore 전이
 *   useDragHandlers → dragStateStore + pendingStore + turnStateStore 업데이트
 *   useTurnActions → WS bridge 경유 C2S 발신 + store 전이
 *
 * NOTE: GameClient 내부에 자체 DndContext와 handleDragEnd가 있다.
 *       Phase 3에서는 두 구현이 공존한다.
 *       useDragHandlers/useTurnActions는 store 연결을 준비하지만
 *       실제 드래그/액션 이벤트는 GameClient가 처리한다.
 *       Phase 4에서 GameClient의 DndContext와 핸들러를 이 컴포넌트로 이전.
 */
export default function GameRoom({ roomId }: GameRoomProps) {
  // ---------------------------------------------------------------------------
  // Phase 2 hook 활성화
  // ---------------------------------------------------------------------------

  // F-01: TURN_START/GAME_OVER/INVALID_MOVE 감지 → pendingStore/turnStateStore dispatch
  useGameSync(roomId);

  // F-02~F-06: 드래그 핸들러 store 상태 초기화
  // [보존 — Phase 4 연결 예정]
  // 이 hook을 마운트하면 handleDragStart/End/Cancel 함수와 store 액션이 준비된다.
  // Phase 3에서는 직접 DndContext에 연결하지 않는다 (GameClient의 DndContext 사용).
  // Phase 4에서 GameClient DndContext를 이 컴포넌트로 이전 시 직접 연결.
  const _dragHandlers = useDragHandlers();
  void _dragHandlers;

  // F-09/F-11: 턴 액션 (useTurnActions)은 GameClient 내부에서 직접 호출한다.
  // GameClient가 WS 브릿지 등록(registerWSSendBridge) 이후에 useTurnActions()를 호출하므로
  // 이 컴포넌트에서 중복 인스턴스를 생성할 필요가 없다.
  // Phase 4에서 GameRoom이 turnActions를 props로 내려주는 방식으로 전환할 때 이 주석을 제거한다.

  // F-04/F-17: hasInitialMeld SSOT 단일화 (InitialMeldBanner/GroupDropZone 연결 준비)
  // [보존 — Phase 4 연결 예정]
  // InitialMeldBanner, GroupDropZone이 이 hook의 반환값을 사용하게 될 예정이다.
  const _meldGuard = useInitialMeldGuard();
  void _meldGuard;

  // F-15: 턴 타이머 활성화 (TimerView 연결 준비)
  // [보존 — Phase 4 연결 예정]
  // TurnTimer 컴포넌트가 독자적으로 useTurnTimer를 호출하지만,
  // GameRoom에서도 타이머 상태를 참조해 턴 강제 종료 로직에 연결할 예정이다.
  const _timer = useTurnTimer();
  void _timer;

  // P1: _turnState (useTurnStateStore 구독) 제거
  //     GameClient 내부 useTurnActions가 turnStateStore를 직접 구독하므로 중복.
  //     Phase 3 과도기에서 이 컴포넌트가 별도로 FSM 상태를 구독할 필요 없음.

  // P1: _hasPending (usePendingStore 구독) 제거
  //     GameClient 내부에서 usePendingStore를 직접 구독(subscribedByGameClient)하고,
  //     useTurnActions가 gameStore에서 pending 상태를 직접 읽으므로 중복.

  // ---------------------------------------------------------------------------
  // 렌더 — GameClient에 위임 (기존 기능 전체 보존)
  // ---------------------------------------------------------------------------
  return <GameClient roomId={roomId} />;
}
