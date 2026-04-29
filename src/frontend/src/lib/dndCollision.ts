/**
 * dndCollision — dnd-kit 커스텀 collisionDetection 헬퍼 (L3 순수 함수)
 *
 * SSOT 매핑:
 *   - 56b A3: 커스텀 collisionDetection (pointerWithin 우선, closestCenter fallback)
 *   - F-21: 호환 드롭존 시각 강조 (정확한 over 매칭 의존)
 *
 * 계층 규칙: L3 순수 함수. dnd-kit 외부 의존성 없음. L1/L2/L4 import 금지.
 *
 * P3-3 Step 3b (2026-04-29): GameClient.tsx 에서 추출하여 lib 로 이전.
 *   GameRoom 이 DndContext 를 소유할 때 동일 헬퍼를 import 한다.
 */

import { closestCenter, pointerWithin } from "@dnd-kit/core";
import type { CollisionDetection } from "@dnd-kit/core";

/**
 * pointerWithin 우선, 비어있으면 closestCenter fallback.
 *
 * 근거: closestCenter 는 포인터가 빈 공간에 있을 때도 "가장 가까운" 드롭 타겟을
 * 선택하여 의도하지 않은 그룹 오매핑을 유발한다.
 * pointerWithin 은 실제 포인터가 드롭존 rect 안에 있을 때만 매칭하므로
 * 빈 공간 드롭 시 빈 배열을 반환 → game-board fallback 으로 정확히 진입한다.
 *
 * 이 fallback 동작 (빈 공간 드롭 → closestCenter 가 game-board 매칭) 이
 * "+ 새 그룹" 자동 생성 경로의 진입점이다.
 */
export const pointerWithinThenClosest: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return closestCenter(args);
};
