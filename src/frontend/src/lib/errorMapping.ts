/**
 * errorMapping — ERR_* → 한글 메시지 매핑 SSOT (L3 순수 함수)
 *
 * SSOT 매핑:
 *   - UR-21: INVALID_MOVE 토스트 = 빨강, ERR_* 메시지 표시
 *   - UR-34: state 부패 토스트 금지 — invariant validator류 메시지는 이 파일에 없음
 *
 * 출처: useWebSocket.ts:49~79의 INVALID_MOVE_MESSAGES 분리 (RDX-05 정신)
 * 이전 위치: useWebSocket.ts 내 인라인 상수 + 함수
 *
 * 금지:
 *   - store, WS, DOM import 불가 (L3 계층 규칙)
 *   - UR-34: invariant validator / source guard 류 토스트 메시지 추가 금지
 */

/**
 * 서버 에러 코드 → 한글 메시지 매핑 테이블
 *
 * BUG-UI-012 카피 에디트 (2026-04-24): 용어 일관성 + 명료성 개선
 * 변경 기준: docs/02-design/53-ux004-extend-lock-copy.md §5 게임 용어 일관성 표
 */
const ERROR_MESSAGES: Record<string, string> = {
  // 세트 유효성 관련 (V-01)
  ERR_INVALID_SET: "유효하지 않은 타일 조합이에요. 그룹 또는 런 조건을 확인해 주세요",
  ERR_SET_SIZE: "멜드는 타일 3장 이상이어야 해요",
  ERR_GROUP_NUMBER: "그룹은 모든 타일의 숫자가 같아야 해요",
  ERR_GROUP_COLOR_DUP: "그룹에 같은 색상 타일이 중복되었어요",
  ERR_RUN_COLOR: "런은 모든 타일의 색상이 같아야 해요",
  ERR_RUN_SEQUENCE: "런의 숫자가 연속되지 않았어요",
  ERR_RUN_RANGE: "런의 숫자는 1~13 범위여야 해요",
  ERR_RUN_DUPLICATE: "런에 같은 숫자의 타일이 중복되었어요",
  ERR_RUN_NO_NUMBER: "런에 숫자 타일이 최소 1장 이상 필요해요",
  // 턴 규칙 관련 (V-03, V-06, V-07)
  ERR_NO_RACK_TILE: "내 타일을 최소 1장 사용해야 확정할 수 있어요",
  ERR_TABLE_TILE_MISSING: "보드 타일이 일부 사라졌어요. 초기화 후 다시 시도해 주세요",
  ERR_JOKER_NOT_USED: "교체한 조커는 같은 턴에 사용해야 해요",
  // 초기 등록 관련 (V-04, V-05, V-13a)
  // 용어 기준: docs/02-design/53-ux004-extend-lock-copy.md §5 "초기 등록" 통일
  ERR_INITIAL_MELD_SCORE: "초기 등록은 30점 이상이어야 해요",
  ERR_INITIAL_MELD_SOURCE: "초기 등록은 내 타일로만 해야 해요",
  ERR_NO_REARRANGE_PERM: "초기 등록(30점 확정) 전에는 보드 재배치가 불가해요",
  // 턴 순서 관련 (V-08, V-09, V-10)
  ERR_NOT_YOUR_TURN: "지금은 내 차례가 아니에요",
  ERR_DRAW_PILE_EMPTY: "드로우 더미가 비었어요",
  ERR_TURN_TIMEOUT: "턴 시간이 초과되었어요",
  // 타일 파싱 관련 (D-04)
  ERR_INVALID_TILE_CODE: "인식할 수 없는 타일 코드예요",
  // WS 시퀀스 관련 (V-19, UR-29)
  STALE_SEQ: "통신 지연 — 다시 시도해 주세요",
  // 레거시 호환 (서버 이전 버전 응답)
  ERR_GROUP_INVALID: "유효하지 않은 그룹이에요",
  ERR_RUN_INVALID: "유효하지 않은 런이에요",
  ERR_TILE_NOT_IN_RACK: "내 타일에 없는 타일을 배치하려 했어요",
  ERR_TILE_CONSERVATION: "보드 타일이 유실되었어요. 초기화 후 다시 시도해 주세요",
};

/**
 * ERR_* 코드를 한글 메시지로 변환한다.
 *
 * UR-21: INVALID_MOVE 토스트에서 사용.
 * UR-34: 이 함수는 서버 에러 코드 변환만 담당. invariant validator 메시지는 없음.
 *
 * @param code 서버 에러 코드 (예: "ERR_SET_SIZE")
 * @param fallback 코드가 매핑 테이블에 없을 때 대체 메시지
 * @returns 한글 메시지
 */
export function resolveErrorMessage(code: string, fallback?: string): string {
  return ERROR_MESSAGES[code] ?? fallback ?? "유효하지 않은 배치입니다";
}
