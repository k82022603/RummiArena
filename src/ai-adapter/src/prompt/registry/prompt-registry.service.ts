import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActiveVariantInfo,
  ModelType,
  PromptVariant,
  ResolveOptions,
} from './prompt-registry.types';
import { v2Variant } from './variants/v2.variant';
import { v3Variant } from './variants/v3.variant';
import { v3TunedVariant } from './variants/v3-tuned.variant';
import { v4Variant } from './variants/v4.variant';
import { v4_1Variant } from './variants/v4-1.variant';
import { v5Variant } from './variants/v5.variant';
import { characterKoVariant } from './variants/character-ko.variant';

/**
 * PromptRegistry — 5개 어댑터 공통 프롬프트 단일 source of truth.
 *
 * 설계: docs/02-design/39-prompt-registry-architecture.md §4
 *
 * 핵심 책임:
 *   1. 빌드 타임에 등록된 변형(PromptVariant) 을 id 로 lookup
 *   2. 환경변수 우선순위에 따라 각 ModelType 에 대한 active variant 결정
 *   3. SP4 A/B 실험 프레임워크가 임시 변형을 register() 로 주입할 수 있도록 허용
 *
 * 우선순위 (resolve()):
 *   1. opts.variantId (코드 명시 지정)
 *   2. <MODEL>_PROMPT_VARIANT 환경변수 (per-model override)
 *   3. PROMPT_VARIANT 글로벌 환경변수
 *   4. defaultForModel() 의 권장 매핑 (registry 내장)
 *   5. 'v2' fallback (위 모두 실패 시)
 *
 * Backward compat:
 *   - USE_V2_PROMPT=true 가 설정되어 있으면 globalVariantId='v2' 강제 + 1회 deprecation warn.
 *     Sprint 7 에 USE_V2_PROMPT 자체를 제거.
 */
@Injectable()
export class PromptRegistry implements OnModuleInit {
  private readonly logger = new Logger(PromptRegistry.name);
  private readonly variants = new Map<string, PromptVariant>();
  private readonly perModelOverrides = new Map<ModelType, string>();
  private globalVariantId: string | null = null;
  private legacyUseV2Detected = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.registerBuiltinVariants();
    this.loadEnvironmentOverrides();
    this.logActiveConfiguration();
  }

  /**
   * 모델 타입에 적절한 변형을 반환한다.
   * 우선순위는 클래스 docstring 참조.
   */
  resolve(modelType: ModelType, opts: ResolveOptions = {}): PromptVariant {
    const variantId = this.resolveVariantId(modelType, opts);
    const variant = this.variants.get(variantId);
    if (!variant) {
      this.logger.warn(
        `[PromptRegistry] 변형 미등록: ${variantId} → v2 로 fallback (modelType=${modelType})`,
      );
      return this.variants.get('v2')!;
    }

    if (
      variant.metadata.warnIfOffRecommendation &&
      !variant.metadata.recommendedModels.includes(modelType)
    ) {
      this.logger.warn(
        `[PromptRegistry] ${variantId} 는 ${modelType} 에 권장되지 않음 (recommended=${variant.metadata.recommendedModels.join(',')})`,
      );
    }

    return variant;
  }

  /** 모든 등록 변형 목록 — admin/diagnostic 용 */
  list(): PromptVariant[] {
    return Array.from(this.variants.values());
  }

  /** 특정 모델 타입의 현재 active variant + 결정 출처 조회 */
  getActiveVariant(modelType: ModelType): ActiveVariantInfo {
    if (this.perModelOverrides.has(modelType)) {
      return {
        modelType,
        variantId: this.perModelOverrides.get(modelType)!,
        source: 'env-per-model',
      };
    }
    if (this.globalVariantId) {
      return {
        modelType,
        variantId: this.globalVariantId,
        source: 'env-global',
      };
    }
    return {
      modelType,
      variantId: this.defaultForModel(modelType),
      source: 'default-recommendation',
    };
  }

  /**
   * 변형 등록 — 외부 모듈(SP4 A/B 실험 프레임워크) 이 임시 변형을 주입할 때 사용.
   * 동일 id 재등록 시 덮어쓰기 + warn 로그.
   */
  register(variant: PromptVariant): void {
    if (this.variants.has(variant.id)) {
      const prev = this.variants.get(variant.id)!;
      this.logger.warn(
        `[PromptRegistry] 변형 덮어쓰기: ${variant.id} (이전 version=${prev.version}, 신규 version=${variant.version})`,
      );
    }
    this.variants.set(variant.id, variant);
  }

  // ---- private ----

  private registerBuiltinVariants(): void {
    this.register(v2Variant);
    this.register(v3Variant);
    this.register(v3TunedVariant);
    this.register(v4Variant);
    this.register(v4_1Variant);
    this.register(v5Variant);
    this.register(characterKoVariant);
  }

  private loadEnvironmentOverrides(): void {
    // Backward compat: USE_V2_PROMPT=true 가 설정되어 있으면 globalVariantId='v2' 강제
    const useV2 = this.configService.get<string>('USE_V2_PROMPT');
    if (useV2 === 'true') {
      this.legacyUseV2Detected = true;
      this.globalVariantId = 'v2';
      this.logger.warn(
        '[PromptRegistry] DEPRECATED: USE_V2_PROMPT=true 감지 → PROMPT_VARIANT=v2 로 강제 변환. Sprint 7 에 USE_V2_PROMPT 제거 예정. PROMPT_VARIANT 환경변수로 마이그레이션 권장.',
      );
    }

    const global = this.configService.get<string>('PROMPT_VARIANT');
    if (global && global.length > 0) {
      this.globalVariantId = global;
    }

    // 모델별 override
    const perModelEnvKeys: Array<[ModelType, string]> = [
      ['openai', 'OPENAI_PROMPT_VARIANT'],
      ['claude', 'CLAUDE_PROMPT_VARIANT'],
      ['deepseek', 'DEEPSEEK_PROMPT_VARIANT'],
      ['deepseek-reasoner', 'DEEPSEEK_REASONER_PROMPT_VARIANT'],
      ['dashscope', 'DASHSCOPE_PROMPT_VARIANT'],
      ['ollama', 'OLLAMA_PROMPT_VARIANT'],
    ];
    for (const [modelType, envKey] of perModelEnvKeys) {
      const v = this.configService.get<string>(envKey);
      if (v && v.length > 0) {
        this.perModelOverrides.set(modelType, v);
      }
    }
  }

  private resolveVariantId(
    modelType: ModelType,
    opts: ResolveOptions,
  ): string {
    if (opts.variantId) return opts.variantId;
    if (this.perModelOverrides.has(modelType)) {
      return this.perModelOverrides.get(modelType)!;
    }
    if (this.globalVariantId) {
      return this.globalVariantId;
    }
    return this.defaultForModel(modelType);
  }

  private defaultForModel(modelType: ModelType): string {
    // Registry 내장 권장 매핑 — 39번 §5 권장 표.
    // ★ deepseek-reasoner: 기존 v2 하드코딩 → v3 권장으로 전환 (behavior change)
    const map: Record<ModelType, string> = {
      openai: 'v2', // gpt-5-mini 추론모델 — v2 검증됨
      claude: 'v2', // claude-sonnet-4 — v2 + extended thinking
      deepseek: 'v2', // deepseek-chat — v2
      'deepseek-reasoner': 'v3', // ★ behavior change: 자동 v2→v3
      dashscope: 'v3', // qwen3 thinking — v3 (이미 사용 중)
      ollama: 'v2', // qwen2.5:3b — v2 (소형 모델)
    };
    return map[modelType] ?? 'v2';
  }

  private logActiveConfiguration(): void {
    const variants = Array.from(this.variants.keys()).join(',');
    const overrides = Array.from(this.perModelOverrides.entries())
      .map(([m, v]) => `${m}:${v}`)
      .join(',');
    this.logger.log(
      `[PromptRegistry] 등록 변형=[${variants}] 글로벌=${this.globalVariantId ?? '(none, default-recommendation)'} per-model-override=[${overrides || '(none)'}] legacyUseV2=${this.legacyUseV2Detected}`,
    );
  }
}
