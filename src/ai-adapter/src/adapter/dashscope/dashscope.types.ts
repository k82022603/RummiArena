/**
 * DashScope (Alibaba Cloud Model Studio) OpenAI 호환 모드 요청/응답 타입.
 *
 * 참조:
 *   - 기반 엔드포인트: https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 *   - 설계 문서: docs/02-design/34-dashscope-qwen3-adapter-design.md (§16, §17)
 *
 * OpenAI ChatCompletion 과 호환되므로 기본 구조는 동일하지만,
 * DashScope 고유 확장 필드(`enable_thinking`, `thinking_budget`) 및
 * thinking 전용 모델(`qwen3-*-thinking-2507`)의 `reasoning_content` 응답 필드를 포함한다.
 */

/** 어댑터에서 사용할 확정 모델 ID 목록 (설계 §17.7) */
export const DASHSCOPE_MODELS = {
  QWEN3_235B_THINKING: 'qwen3-235b-a22b-thinking-2507',
  QWEN3_NEXT_80B_THINKING: 'qwen3-next-80b-a3b-thinking',
  QWEN3_30B_THINKING: 'qwen3-30b-a3b-thinking-2507',
  QWEN3_MAX: 'qwen3-max-2026-01-23',
  QWEN_PLUS_LATEST: 'qwen-plus-latest',
  QWEN_FLASH_LATEST: 'qwen-flash',
  QWEN3_5_PLUS: 'qwen3.5-plus',
} as const;

export type DashScopeModelId = (typeof DASHSCOPE_MODELS)[keyof typeof DASHSCOPE_MODELS];

export const DASHSCOPE_DEFAULT_MODEL: DashScopeModelId =
  DASHSCOPE_MODELS.QWEN3_235B_THINKING;

export const DASHSCOPE_BASE_URL =
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

/** USD per 1M tokens (2026-04-14 기준, 설계 §17.3) */
export const DASHSCOPE_PRICING: Record<string, { input: number; output: number }> = {
  'qwen3-235b-a22b-thinking-2507': { input: 0.23, output: 2.3 },
  'qwen3-next-80b-a3b-thinking': { input: 0.15, output: 1.2 },
  'qwen3-max-2026-01-23': { input: 1.2, output: 6.0 },
  'qwen-plus-latest': { input: 0.4, output: 4.0 },
  'qwen-flash': { input: 0.05, output: 0.4 },
};

/** thinking-only 모델은 `enable_thinking` 플래그 비활성화가 불가능하다 (설계 §17.2) */
export const THINKING_ONLY_MODELS: readonly string[] = [
  DASHSCOPE_MODELS.QWEN3_235B_THINKING,
  DASHSCOPE_MODELS.QWEN3_NEXT_80B_THINKING,
  DASHSCOPE_MODELS.QWEN3_30B_THINKING,
];

export function isThinkingOnlyModel(modelName: string): boolean {
  return THINKING_ONLY_MODELS.includes(modelName);
}

/**
 * OpenAI 호환 chat/completions 요청 바디.
 * DashScope 확장 필드(`enable_thinking`, `thinking_budget`)를 포함한다.
 */
export interface DashScopeChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: 'json_object' | 'text' };
  stream?: boolean;
  stream_options?: { include_usage?: boolean };

  /**
   * DashScope 고유 확장: thinking 모드 활성화.
   * - thinking-only 모델(qwen3-*-thinking-2507)은 이 값을 무시하고 항상 사고한다.
   * - hybrid 모델(qwen-plus 등)은 `true` 를 명시해야 reasoning_content 가 반환된다.
   */
  enable_thinking?: boolean;

  /**
   * DashScope 고유 확장: thinking 토큰 상한.
   * 초과 시 즉시 응답 생성. Round 5 DeepSeek 실측 최대 15,614 기반 15000 권장.
   */
  thinking_budget?: number;
}

/** chat/completions 응답의 choice 메시지 (reasoning_content 확장 포함) */
export interface DashScopeChoiceMessage {
  role: 'assistant';
  content: string | null;
  /** thinking 활성 시에만 반환, hybrid 모델에서 `enable_thinking=false` 일 때 null */
  reasoning_content?: string | null;
}

export interface DashScopeChoice {
  index: number;
  message: DashScopeChoiceMessage;
  finish_reason: 'stop' | 'length' | 'content_filter' | string;
}

export interface DashScopeUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface DashScopeChatResponse {
  id: string;
  object: 'chat.completion';
  choices: DashScopeChoice[];
  usage: DashScopeUsage;
  model: string;
}

/**
 * DashScope 에러 응답 카테고리.
 * 공식 compat 페이지 상태 코드 테이블 참조 (설계 §17.6).
 */
export type DashScopeErrorKind =
  | 'auth'          // 401
  | 'rate_limit_qps' // 429 - QPS/QPM 초과, 재시도 가능
  | 'quota_exceeded' // 429 - 계정 quota 초과, 재시도 불가 → 즉시 fallback
  | 'server_error'  // 500
  | 'overloaded'    // 503
  | 'timeout'       // 클라이언트 타임아웃
  | 'unknown';
