import { Injectable } from '@nestjs/common';
import { OpenAiAdapter } from '../adapter/openai.adapter';
import { ClaudeAdapter } from '../adapter/claude.adapter';
import { DeepSeekAdapter } from '../adapter/deepseek.adapter';
import { OllamaAdapter } from '../adapter/ollama.adapter';

/**
 * 모든 LLM 어댑터의 연결 상태를 일괄 확인하는 서비스.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly openAiAdapter: OpenAiAdapter,
    private readonly claudeAdapter: ClaudeAdapter,
    private readonly deepSeekAdapter: DeepSeekAdapter,
    private readonly ollamaAdapter: OllamaAdapter,
  ) {}

  /**
   * 모든 어댑터 헬스체크를 병렬로 실행한다.
   * 개별 어댑터 실패가 전체 서비스를 중단시키지 않도록 각각 독립 처리한다.
   */
  async checkAllAdapters(): Promise<Record<string, boolean>> {
    const [openai, claude, deepseek, ollama] = await Promise.allSettled([
      this.openAiAdapter.healthCheck(),
      this.claudeAdapter.healthCheck(),
      this.deepSeekAdapter.healthCheck(),
      this.ollamaAdapter.healthCheck(),
    ]);

    return {
      openai: openai.status === 'fulfilled' && openai.value,
      claude: claude.status === 'fulfilled' && claude.value,
      deepseek: deepseek.status === 'fulfilled' && deepseek.value,
      ollama: ollama.status === 'fulfilled' && ollama.value,
    };
  }
}
