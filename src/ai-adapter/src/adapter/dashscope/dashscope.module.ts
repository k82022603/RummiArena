import { Module } from '@nestjs/common';
import { DashScopeAdapter } from './dashscope.service';
import { PromptBuilderService } from '../../prompt/prompt-builder.service';
import { ResponseParserService } from '../../common/parser/response-parser.service';
import { CharacterModule } from '../../character/character.module';

/**
 * DashScope (Alibaba Cloud Model Studio) 어댑터 전용 NestJS 모듈.
 *
 * 현재는 MoveModule 이 어댑터를 직접 provider 배열에 포함하는 구조이므로
 * 이 모듈은 향후 MoveModule 분할 리팩터링 혹은 통합 테스트용으로 사용된다.
 * Sprint 7 에 API 키 발급 후 MoveModule providers 배열에 DashScopeAdapter 를 추가하고
 * move.service.ts 의 ModelType 유니온/selectAdapter 스위치에 'dashscope' 케이스를 연결한다.
 *
 * 설계 문서: docs/02-design/34-dashscope-qwen3-adapter-design.md
 */
@Module({
  imports: [CharacterModule],
  providers: [DashScopeAdapter, PromptBuilderService, ResponseParserService],
  exports: [DashScopeAdapter],
})
export class DashScopeModule {}
