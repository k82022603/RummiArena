import { MoveRequestDto } from '../dto/move-request.dto';
import { MoveResponseDto } from '../dto/move-response.dto';

/**
 * 모든 LLM 어댑터가 구현해야 하는 공통 인터페이스.
 * Game Engine은 이 인터페이스에만 의존하므로 LLM 교체가 자유롭다.
 */
export interface AiAdapterInterface {
  /**
   * 게임 상태를 받아 AI의 다음 수를 생성한다.
   * 실패 시 최대 maxRetries 횟수만큼 재시도하고, 모두 실패하면 강제 드로우를 반환한다.
   */
  generateMove(request: MoveRequestDto): Promise<MoveResponseDto>;

  /**
   * 어댑터가 사용하는 모델 정보를 반환한다.
   */
  getModelInfo(): ModelInfo;

  /**
   * LLM API 또는 로컬 서비스 연결 상태를 확인한다.
   */
  healthCheck(): Promise<boolean>;
}

export interface ModelInfo {
  /** 모델 공급자 타입 (openai | claude | deepseek | ollama) */
  modelType: string;
  /** 실제 모델명 (예: gpt-4o, claude-sonnet-4-20250514) */
  modelName: string;
  /** API 엔드포인트 기본 URL */
  baseUrl: string;
}
