import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { OpenAiAdapter } from '../adapter/openai.adapter';
import { ClaudeAdapter } from '../adapter/claude.adapter';
import { DeepSeekAdapter } from '../adapter/deepseek.adapter';
import { OllamaAdapter } from '../adapter/ollama.adapter';
import { AiAdapterInterface } from '../common/interfaces/ai-adapter.interface';
import { MoveRequestDto } from '../common/dto/move-request.dto';
import { MoveResponseDto } from '../common/dto/move-response.dto';

export type ModelType = 'openai' | 'claude' | 'deepseek' | 'ollama';

/**
 * Move 비즈니스 로직 서비스.
 *
 * model 파라미터를 보고 적절한 어댑터를 선택한 뒤 generateMove()를 위임한다.
 * 재시도 로직과 fallback 드로우는 BaseAdapter에 이미 내장되어 있으므로
 * 이 서비스는 어댑터 선택과 오류 변환에만 집중한다.
 */
@Injectable()
export class MoveService {
  private readonly logger = new Logger(MoveService.name);

  constructor(
    private readonly openAiAdapter: OpenAiAdapter,
    private readonly claudeAdapter: ClaudeAdapter,
    private readonly deepSeekAdapter: DeepSeekAdapter,
    private readonly ollamaAdapter: OllamaAdapter,
  ) {}

  /**
   * 요청된 모델에 해당하는 어댑터를 선택하여 AI 수를 생성한다.
   * @param model LLM 공급자 타입
   * @param request 게임 상태 + AI 설정이 담긴 DTO
   */
  async generateMove(
    model: ModelType,
    request: MoveRequestDto,
  ): Promise<MoveResponseDto> {
    const adapter = this.selectAdapter(model);

    this.logger.log(
      `[MoveService] gameId=${request.gameId} playerId=${request.playerId} model=${model} persona=${request.persona} difficulty=${request.difficulty} psychologyLevel=${request.psychologyLevel}`,
    );

    const response = await adapter.generateMove(request);

    this.logger.log(
      `[MoveService] 완료 gameId=${request.gameId} action=${response.action} retryCount=${response.metadata.retryCount} latencyMs=${response.metadata.latencyMs}`,
    );

    return response;
  }

  /**
   * model 타입 문자열을 실제 어댑터 인스턴스로 매핑한다.
   * 알 수 없는 모델 타입이면 BadRequestException을 던진다.
   */
  private selectAdapter(model: ModelType): AiAdapterInterface {
    const adapters: Record<ModelType, AiAdapterInterface> = {
      openai: this.openAiAdapter,
      claude: this.claudeAdapter,
      deepseek: this.deepSeekAdapter,
      ollama: this.ollamaAdapter,
    };

    const adapter = adapters[model];
    if (!adapter) {
      throw new BadRequestException(
        `지원하지 않는 모델입니다: "${model}". 사용 가능한 모델: openai, claude, deepseek, ollama`,
      );
    }

    return adapter;
  }
}
