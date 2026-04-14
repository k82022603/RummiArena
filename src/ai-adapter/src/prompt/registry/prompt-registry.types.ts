import { GameStateDto } from '../../common/dto/move-request.dto';

/**
 * PromptRegistry 의 타입 정의 (설계: docs/02-design/39-prompt-registry-architecture.md §4.2).
 *
 * 5개 어댑터 모두 동일 PromptRegistry 인터페이스를 통해 시스템/유저/재시도 프롬프트를 받는다.
 * 변형 등록은 빌드 타임에 끝나며, A/B 실험은 SP4 가 register() 로 임시 변형을 주입.
 */

export type ModelType =
  | 'openai'
  | 'claude'
  | 'deepseek'
  | 'deepseek-reasoner'
  | 'dashscope'
  | 'ollama';

export type ThinkingMode = 'standard' | 'extended' | 'thinking-only';

export interface PromptMetadata {
  /** 사람이 읽기 위한 한 줄 설명 */
  description: string;
  /** 토큰 예산 (system prompt 만, user prompt 제외) */
  tokenBudget: number;
  /** 이 변형에 가장 적합한 모델들 — registry 가 자동 매핑에 사용 */
  recommendedModels: ModelType[];
  /** 권장 temperature (어댑터가 callLlm 호출 시 사용) */
  recommendedTemperature: number;
  /** 설계 문서 경로 (PR 리뷰어가 참조) */
  designDoc: string;
  /** YYYY-MM-DD */
  introducedAt: string;
  /** A/B 실험 태그 — 활성 실험 시 'A' | 'B' */
  experimentTag?: 'A' | 'B' | string;
  /** 추론 모델 thinking 모드 */
  thinkingMode?: ThinkingMode;
  /** 이 변형이 권장 모델 외에서 사용될 때 경고 출력 여부 */
  warnIfOffRecommendation?: boolean;
}

/**
 * gameState 인자의 구조. 어댑터 측 GameStateDto 와 호환되는 최소 형태.
 * v2/v3/v3-tuned 의 기존 builder signature 와 정확히 일치한다.
 */
export type PromptGameState = Pick<
  GameStateDto,
  'tableGroups' | 'myTiles' | 'turnNumber' | 'drawPileCount' | 'initialMeldDone'
> & {
  opponents: Array<{ playerId: string; remainingTiles: number }>;
};

export interface PromptVariant {
  /** 'v3-tuned' — kebab-case, 환경변수 PROMPT_VARIANT 값과 동일 */
  id: string;
  /** semver — 같은 id 의 minor 개정 추적 (v3.0.1 등) */
  version: string;
  /** 상속 관계 — 'v3-tuned' 의 baseVariant 는 'v3' */
  baseVariant?: string;
  /** 시스템 프롬프트 빌더 (인자 없음 — 정적) */
  systemPromptBuilder: () => string;
  /** 유저 프롬프트 빌더 (게임 상태 의존) */
  userPromptBuilder: (gameState: PromptGameState) => string;
  /** 재시도 프롬프트 빌더 */
  retryPromptBuilder: (
    gameState: PromptGameState,
    errorReason: string,
    attempt: number,
  ) => string;
  /** 메타데이터 */
  metadata: PromptMetadata;
}

export interface ResolveOptions {
  /** override 변형 id — 없으면 환경변수에서 로드 */
  variantId?: string;
  /** A/B 실험 모드: 'A' / 'B' 중 하나 강제 */
  experimentTag?: 'A' | 'B';
}

export interface ActiveVariantInfo {
  modelType: ModelType;
  variantId: string;
  source:
    | 'env-global'
    | 'env-per-model'
    | 'default-recommendation'
    | 'fallback';
}
