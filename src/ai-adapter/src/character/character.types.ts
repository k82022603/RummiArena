/**
 * AI 캐릭터 시스템 타입 정의.
 *
 * 6개 캐릭터 × 3 난이도 × 심리전 Level 0~3의 조합으로
 * 다양한 전략 스타일을 시뮬레이션한다.
 *
 * 타일 인코딩: {Color}{Number}{Set}
 *   - Color: R(빨강), B(파랑), Y(노랑), K(검정)
 *   - Number: 1~13
 *   - Set: a | b
 *   - 조커: JK1, JK2
 *   - 예: R7a, B13b, JK1
 */

export type CharacterType =
  | 'rookie'
  | 'calculator'
  | 'shark'
  | 'fox'
  | 'wall'
  | 'wildcard';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'expert';

export type PsychWarfareLevel = 0 | 1 | 2 | 3;

/**
 * 캐릭터 프로필 - 캐릭터의 특성을 설명하는 메타데이터.
 * 게임 UI에서 캐릭터 선택 화면에 표시하거나 로그에 기록할 때 사용한다.
 */
export interface CharacterProfile {
  /** 캐릭터 식별자 */
  name: CharacterType;
  /** 화면에 표시될 캐릭터 이름 (한글) */
  displayName: string;
  /** 전략 스타일 요약 */
  strategyDescription: string;
  /** 이 캐릭터의 강점 */
  strengths: string[];
  /** 이 캐릭터의 약점 */
  weaknesses: string[];
}

/**
 * 캐릭터별 페르소나 프롬프트 템플릿.
 * persona.templates.ts에서 실제 템플릿 데이터를 정의한다.
 */
export interface PersonaTemplate {
  /** 캐릭터의 기본 페르소나 및 게임 스타일 지시문 */
  systemPrompt: string;
  /** 난이도별 전략 힌트 */
  strategyHints: {
    beginner: string;
    intermediate: string;
    expert: string;
  };
  /** 심리전 레벨별 추가 지시문 */
  psychWarfare: {
    level1: string;
    level2: string;
    level3: string;
  };
  /** 행동 결정 방식 설명 (프롬프트 마지막에 삽입) */
  decisionStyle: string;
}

/**
 * CharacterService.getCharacterPrompt() 반환 타입.
 * 시스템 프롬프트와 심리전 프롬프트를 분리하여 반환한다.
 */
export interface CharacterPromptResult {
  /** 최종 조합된 시스템 프롬프트 */
  systemPrompt: string;
  /** 심리전 레벨 프롬프트 (Level 0이면 빈 문자열) */
  psychWarfarePrompt: string;
}

/**
 * 심리전 프롬프트 생성에 필요한 게임 컨텍스트.
 */
export interface GameContextForPsych {
  /** 상대 플레이어들의 남은 타일 수 */
  opponentTileCounts: number[];
  /** 현재 턴 번호 */
  turnNumber: number;
  /** 드로우 파일 남은 수 */
  drawPileCount: number;
}
