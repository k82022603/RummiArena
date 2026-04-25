/**
 * classifySetType — 세트 타입 분류 SSOT (L3 순수 함수)
 *
 * SSOT 매핑:
 *   - D-10: tableGroup.type 힌트는 참고용. 진실은 tiles 내용.
 *   - V-01: 유효한 그룹(같은 숫자·다른 색) 또는 런(같은 색·연속 숫자)
 *   - 56b §3.5~3.6: A1~A12 모든 분기에서 동일 분류 기준 사용
 *
 * 금지: store, WS, DOM import 불가 (L3 계층 규칙)
 *
 * 이전 중복 정의 위치:
 *   - dragEndReducer.ts:25~35 (폐기 → 본 파일로 통합 RDX-05)
 *   - GameClient.tsx:내부 (폐기 예정)
 */

import type { TileCode, GroupType } from "@/types/tile";
import { parseTileCode } from "@/types/tile";

/**
 * 타일 배열을 보고 세트 타입을 분류한다.
 *
 * 분류 우선순위:
 *   1. 타일이 0장이면 → "run" (기본값, 타입 힌트 없음)
 *   2. 조커만 있으면 → "run" (타입 미확정)
 *   3. 일반 타일의 숫자가 모두 같으면 → "group"
 *   4. 일반 타일의 색상이 모두 같으면 → "run"
 *   5. 그 외 → "run" (기본값, 서버 검증에서 V-01 거부)
 *
 * D-10 정책: 타입 힌트와 내용 불일치 시 내용 기준으로 재분류.
 * 상위에서 type 힌트를 신뢰해야 하면 mergeCompatibility.ts의
 * classifyKind()를 사용한다.
 *
 * @param tiles 타일 코드 배열
 * @returns "group" | "run"
 */
export function classifySetType(tiles: TileCode[]): GroupType {
  const regular = tiles.filter((t) => t !== "JK1" && t !== "JK2");

  if (regular.length === 0) return "run";

  const parsed = regular.map((t) => parseTileCode(t));
  const numbers = new Set(parsed.map((t) => t.number));
  const colors = new Set(parsed.map((t) => t.color));

  // 같은 숫자 → group 후보
  if (numbers.size === 1) return "group";
  // 같은 색상 → run 후보
  if (colors.size === 1) return "run";

  // 혼재 → run (서버에서 V-01으로 거부될 것)
  return "run";
}
