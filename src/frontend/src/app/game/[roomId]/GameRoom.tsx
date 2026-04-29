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
 * Phase 3 Sub-C 완료 (2026-04-29):
 *   GameRoom 이 DndContext + sensors + collisionDetection + DragOverlay 어셈블리를 소유하고
 *   useDragHandlers 를 직접 호출한다. GameClient 는 grid + 토스트만 렌더한다.
 *
 *   forceNewGroup / extendLockToast / pendingGroupSeq 등 store 기반 상태는 GameClient 와
 *   GameRoom 양쪽이 동일 selector 로 구독한다 (zustand 가 동일 snapshot 보장).
 *
 *   P3-3 진행 이력:
 *     Step 1   : forceNewGroup → dragStateStore (89ade2)
 *     Step 2   : activeDragCode → dragStateStore.activeTile (7f098e)
 *     Step 3a  : showExtendLockToast → dragStateStore (c3cd2e)
 *     Step 3b  : pendingGroupSeq + extendLockToastShown → dragStateStore (2b58b1)
 *     Step 4   : GameClient 인라인 dragEnd 핸들러 ~810줄 제거 (9d773f5)
 *     Sub-A    : 3개 GameClient drag ref 제거 — hook 내부 fallback (a49b4f)
 *     Sub-B    : isMyTurn → useIsMyTurn() hook 추출 (b0270a)
 *     Sub-C    : DndContext + sensors + DragOverlay GameRoom 이전 (본 커밋)
 *
 * 계층 규칙:
 *   - L2(store/hook)만 import. L3 순수 함수 직접 import 금지.
 *   - L4(WS) 직접 import 금지 — GameClient 의 브릿지 경유.
 */

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { motion } from "framer-motion";

// L2 hooks
import { useGameSync } from "@/hooks/useGameSync";
import { useInitialMeldGuard } from "@/hooks/useInitialMeldGuard";
import { useTurnTimer } from "@/hooks/useTurnTimer";
import { useDragHandlers } from "@/hooks/useDragHandlers";
import { useIsMyTurn } from "@/hooks/useIsMyTurn";

// L2 store
import { useDragStateStore } from "@/store/dragStateStore";

// L3 순수 함수 (collisionDetection 어댑터)
import { pointerWithinThenClosest } from "@/lib/dndCollision";

// L1 컴포넌트
import GameClient from "./GameClient";
import Tile from "@/components/tile/Tile";

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
 * Phase 3 Sub-C:
 *   GameRoom 이 DndContext / sensors / collisionDetection / DragOverlay 를 소유한다.
 *   useDragHandlers 를 직접 호출하며 forceNewGroup / setForceNewGroup /
 *   showExtendLockToast(true) / isMyTurn 옵션을 store 기반으로 주입한다.
 *
 * WS 브릿지:
 *   GameClient 내부에서 registerWSSendBridge(send) 를 호출한다.
 *   이 컴포넌트는 브릿지 등록에 관여하지 않는다.
 *
 * store 상태 흐름:
 *   useGameSync → gameStore 변화 감지 → turnStateStore/pendingStore 전이
 *   useDragHandlers → dragStateStore + pendingStore + turnStateStore 업데이트
 *   useTurnActions(GameClient) → WS bridge 경유 C2S 발신 + store 전이
 */
export default function GameRoom({ roomId }: GameRoomProps) {
  // ---------------------------------------------------------------------------
  // Phase 2 hook 활성화
  // ---------------------------------------------------------------------------

  // F-01: TURN_START/GAME_OVER/INVALID_MOVE 감지 → pendingStore/turnStateStore dispatch
  useGameSync(roomId);

  // F-04/F-17: hasInitialMeld SSOT 단일화
  const _meldGuard = useInitialMeldGuard();
  void _meldGuard;

  // F-15: 턴 타이머 활성화
  const _timer = useTurnTimer();
  void _timer;

  // ---------------------------------------------------------------------------
  // Sub-C: DndContext 어셈블리
  // ---------------------------------------------------------------------------

  // dnd-kit 센서 — distance:8 활성화 거리 (탭/클릭 vs 드래그 구분)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // P3-3 Sub-B/C: isMyTurn 단일 selector. GameClient 도 동일 hook 호출하여 동기화.
  const isMyTurn = useIsMyTurn();

  // store 기반 상태 — GameClient 와 동일 zustand snapshot 구독
  const forceNewGroup = useDragStateStore((s) => s.forceNewGroup);
  const setForceNewGroup = useDragStateStore((s) => s.setForceNewGroup);
  const setShowExtendLockToast = useDragStateStore((s) => s.setShowExtendLockToast);

  // P3-2 행동 등가: 9개 분기 + BUG-UI-009/010/EXT guard + UX-004 toast
  // P3-3 Sub-A/C: hook 본체가 dragStateStore-backed ref-like (pendingGroupSeq /
  //   extendLockToastShown) 를 직접 생성하고 transient guard ref 도 fallback 사용.
  //   GameRoom 은 forceNewGroup / setForceNewGroup / showExtendLockToast 콜백 / isMyTurn 만 주입.
  const { handleDragStart, handleDragEnd, handleDragCancel } = useDragHandlers({
    forceNewGroup,
    setForceNewGroup,
    showExtendLockToast: () => setShowExtendLockToast(true),
    isMyTurn,
  });

  // DragOverlay 활성 타일 — store 구독
  const activeDragCode = useDragStateStore((s) => s.activeTile);

  // ---------------------------------------------------------------------------
  // 렌더 — DndContext 가 GameClient 를 감싼다
  // ---------------------------------------------------------------------------
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithinThenClosest}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <GameClient roomId={roomId} />
      {/* 드래그 오버레이: 커서를 따라다니는 타일 (scale 1.1 + 그림자 강화 + grabbing 커서) */}
      <DragOverlay dropAnimation={null}>
        {activeDragCode ? (
          <motion.div
            initial={{ scale: 1.0, rotate: 0, opacity: 0.85 }}
            animate={{ scale: 1.12, rotate: -3, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            style={{
              cursor: "grabbing",
              filter:
                "drop-shadow(0 10px 20px rgba(0,0,0,0.55)) drop-shadow(0 2px 6px rgba(0,0,0,0.35))",
            }}
          >
            <Tile
              code={activeDragCode}
              size="rack"
              draggable
              aria-label={`${activeDragCode} 타일 드래그 중`}
            />
          </motion.div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
