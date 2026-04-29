/**
 * 서버가 보내는 TurnEnd action 열거형 → 한국어 레이블 변환 헬퍼
 *
 * 서버는 대문자 enum 값을 사용한다 (예: DRAW_TILE, PENALTY_DRAW).
 * TurnHistoryPanel 에서 소문자(draw, timeout 등)로 매칭하던 기존 코드가
 * 번역에 실패해 원문이 그대로 노출되는 버그(F-1)를 수정한다.
 */
export function getTurnActionLabel(action: string): string {
  const normalized = action.toUpperCase();
  switch (normalized) {
    case "DRAW_TILE":
    case "DRAW":
      return "드로우";
    case "TIMEOUT":
      return "시간 초과 → 자동 드로우";
    case "PENALTY_DRAW":
      return "강제 드로우 (유효하지 않은 조합 반복)";
    case "FORFEIT":
      return "기권";
    case "PLACE_TILES":
    case "PLACE":
      return "타일 배치";
    default:
      return "행동";
  }
}
