import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { OpenAiAdapter } from '../adapter/openai.adapter';
import { ClaudeAdapter } from '../adapter/claude.adapter';
import { DeepSeekAdapter } from '../adapter/deepseek.adapter';
import { OllamaAdapter } from '../adapter/ollama.adapter';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    OpenAiAdapter,
    ClaudeAdapter,
    DeepSeekAdapter,
    OllamaAdapter,
    PromptBuilderService,
    ResponseParserService,
  ],
})
export class HealthModule {}
