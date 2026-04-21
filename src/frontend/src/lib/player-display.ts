/**
 * 플레이어 표시 이름 공용 헬퍼
 *
 * - GameClient.tsx:229-243 의 getPlayerDisplayName 로직을 공용화
 * - PlayerCard.tsx 의 인라인 문자열 조립도 이 함수로 통일
 * - persona 없을 때 빈 괄호 "GPT ()" 출력 방지
 */

export const AI_TYPE_LABEL: Record<string, string> = {
  AI_OPENAI: "GPT",
  AI_CLAUDE: "Claude",
  AI_DEEPSEEK: "DeepSeek",
  AI_LLAMA: "LLaMA",
};

export const AI_PERSONA_LABEL: Record<string, string> = {
  rookie: "루키",
  calculator: "계산기",
  shark: "샤크",
  fox: "폭스",
  wall: "벽",
  wildcard: "와일드카드",
};

export const AI_DIFFICULTY_LABEL: Record<string, string> = {
  beginner: "하수",
  intermediate: "중수",
  expert: "고수",
};

interface PlayerLike {
  type: string;
  seat?: number;
  displayName?: string;
  persona?: string;
}

/**
 * 플레이어 표시 이름 반환.
 *
 * - HUMAN: displayName 우선, 없으면 fallback
 * - AI: 서버 displayName 우선, 없으면 "GPT (샤크)" 형식.
 *        persona 없을 때는 괄호 없이 "GPT" 만 반환.
 */
export function getPlayerDisplayName(
  player: PlayerLike | null | undefined,
  fallback = "—"
): string {
  if (!player) return fallback;

  if (player.type === "HUMAN") {
    return player.displayName || fallback;
  }

  // AI: 서버가 이미 조합한 displayName이 있으면 우선 사용
  if (player.displayName) return player.displayName;

  const aiLabel = AI_TYPE_LABEL[player.type] ?? player.type;
  const persona = player.persona ? AI_PERSONA_LABEL[player.persona] : undefined;

  // persona 없으면 괄호 자체를 제거
  return persona ? `${aiLabel} (${persona})` : aiLabel;
}
