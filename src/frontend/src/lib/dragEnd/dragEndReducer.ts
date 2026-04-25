/**
 * dragEndReducer -- 순수 함수 드래그 처리 리듀서
 *
 * 본 파일은 Phase D RED spec 테스트를 위한 타입 정의 + stub.
 * 실제 구현은 frontend-dev PR-D03 (F-02 lib/dragEnd 재설계) 에서 채운다.
 *
 * SSOT: docs/02-design/56-action-state-matrix.md
 * SSOT: docs/02-design/58-ui-component-decomposition.md §3
 */

import type { TileCode, TableGroup, GroupType } from "@/types/tile";
import { parseTileCode } from "@/types/tile";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 드래그 출발지 */
export type DragSourceKind = "rack" | "pending" | "server";

export interface DragSource {
  kind: DragSourceKind;
  groupId?: string;   // kind === "pending" | "server" 일 때
  index?: number;     // 그룹 내 타일 인덱스
}

/** 드래그 목적지 */
export type DragDestKind =
  | "new-group"
  | "pending-group"
  | "server-group"
  | "rack"
  | "joker-tile";

export interface DragDest {
  kind: DragDestKind;
  groupId?: string;   // pending-group | server-group 일 때
}

/** 리듀서 입력 */
export interface DragInput {
  /** 드래그한 타일 코드 */
  tileCode: TileCode;
  /** 출발지 */
  source: DragSource;
  /** 목적지 */
  dest: DragDest;

  // -- 현재 상태 --
  /** 내 턴 여부 (V-08) */
  isMyTurn: boolean;
  /** 최초 등록 완료 여부 (V-13a) */
  hasInitialMeld: boolean;
  /** 현재 테이블 그룹 (서버 확정 + pending 혼합) */
  tableGroups: TableGroup[];
  /** 내 랙 타일 */
  myTiles: TileCode[];
  /** pending 그룹 ID 세트 */
  pendingGroupIds: Set<string>;
  /** 회수 조커 목록 */
  pendingRecoveredJokers: TileCode[];
}

/** 리듀서 출력 */
export interface DragOutput {
  /** 변경 적용 여부 (false = 거절, true = 적용) */
  accepted: boolean;
  /** 거절 사유 (accepted=false 시) */
  rejectReason?: string;
  /** SSOT 룰 ID (거절 사유에 대한 근거) */
  ruleId?: string;

  // -- 결과 상태 (accepted=true 시) --
  /** 갱신된 테이블 그룹 */
  nextTableGroups?: TableGroup[];
  /** 갱신된 내 랙 */
  nextMyTiles?: TileCode[];
  /** 갱신된 pending 그룹 ID 세트 */
  nextPendingGroupIds?: Set<string>;
  /** 갱신된 회수 조커 목록 */
  nextPendingRecoveredJokers?: TileCode[];
}

// ---------------------------------------------------------------------------
// Helper: classifySetType (GameClient.tsx 에서 추출 대상)
// ---------------------------------------------------------------------------
export function classifySetType(tiles: TileCode[]): GroupType {
  const regular = tiles.filter((t) => t !== "JK1" && t !== "JK2");
  if (regular.length === 0) return "run";
  if (regular.length === 1) return "run";

  const parsed = regular.map((t) => parseTileCode(t));
  const numbers = new Set(parsed.map((t) => t.number));
  const colors = new Set(parsed.map((t) => t.color));

  if (colors.size === 1) return "run";
  if (numbers.size === 1) return "group";
  return "group";
}

// ---------------------------------------------------------------------------
// Main reducer (stub -- RED 상태)
// ---------------------------------------------------------------------------

/**
 * dragEndReducer: 순수 함수. 드래그 완료 시 상태 전이를 계산한다.
 *
 * @param input - 드래그 입력 (현재 상태 + 이벤트)
 * @returns 결과 (accepted/rejected + 다음 상태)
 *
 * 구현 전 RED 상태. frontend-dev PR-D03 에서 채운다.
 */
export function dragEndReducer(input: DragInput): DragOutput {
  // TODO: PR-D03 에서 구현
  // 현재는 모든 입력에 대해 거절을 반환 (RED spec)
  return {
    accepted: false,
    rejectReason: "NOT_IMPLEMENTED",
  };
}
