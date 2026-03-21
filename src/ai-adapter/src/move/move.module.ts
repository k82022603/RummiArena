import { Module } from '@nestjs/common';
import { MoveController } from './move.controller';
import { MoveService } from './move.service';
import { OpenAiAdapter } from '../adapter/openai.adapter';
import { ClaudeAdapter } from '../adapter/claude.adapter';
import { DeepSeekAdapter } from '../adapter/deepseek.adapter';
import { OllamaAdapter } from '../adapter/ollama.adapter';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { CharacterModule } from '../character/character.module';

/**
 * Move 모듈.
 * POST /move 엔드포인트를 제공하며, game-server의 AI 수 생성 요청을 처리한다.
 * 모델 타입에 따라 적절한 어댑터를 선택하고 generateMove()를 위임한다.
 *
 * CharacterModule을 import하여 PromptBuilderService에 CharacterService를 주입한다.
 */
@Module({
  imports: [CharacterModule],
  controllers: [MoveController],
  providers: [
    MoveService,
    OpenAiAdapter,
    ClaudeAdapter,
    DeepSeekAdapter,
    OllamaAdapter,
    PromptBuilderService,
    ResponseParserService,
  ],
})
export class MoveModule {}
