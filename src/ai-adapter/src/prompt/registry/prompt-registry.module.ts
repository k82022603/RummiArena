import { Global, Module } from '@nestjs/common';
import { PromptRegistry } from './prompt-registry.service';

/**
 * PromptRegistryModule — 5개 어댑터 공통 프롬프트 단일 source of truth.
 *
 * Global 모듈로 등록하여 어떤 모듈에서도 PromptRegistry 를 별도 import 없이 주입 가능.
 * ConfigModule 외 dependency 없으며, OnModuleInit 에서 빌드 타임 변형 등록 + env 로딩 수행.
 *
 * 설계: docs/02-design/39-prompt-registry-architecture.md §4
 */
@Global()
@Module({
  providers: [PromptRegistry],
  exports: [PromptRegistry],
})
export class PromptRegistryModule {}
