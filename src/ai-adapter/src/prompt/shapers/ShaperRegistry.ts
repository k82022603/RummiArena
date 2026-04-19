/**
 * ShaperRegistry — ContextShaper 단일 source of truth.
 *
 * 설계: docs/02-design/44-context-shaper-v6-architecture.md §6
 *
 * 핵심 책임:
 *   1. 등록된 ContextShaper 를 id 로 lookup
 *   2. 환경변수 우선순위에 따라 ModelType 별 active shaper 결정
 *   3. 미등록 id → 'passthrough' fallback + warn 로그
 *
 * 우선순위 (ADR 44 §6.3 — PromptRegistry 와 대칭):
 *   1. opts.shaperId (코드 명시 지정 — 테스트/실험)
 *   2. <MODEL>_CONTEXT_SHAPER 환경변수 (per-model override)
 *   3. DEFAULT_CONTEXT_SHAPER 환경변수 (global)
 *   4. 'passthrough' (내장 default — v2 baseline 호환)
 *
 * SSOT 정합성:
 *   - 이 Registry 는 variant Registry (PromptRegistry) 와 orthogonal.
 *     variant 축은 42번 §2 표 B, shaper 축은 42번 §2 shaper 컬럼에 동기화 (ADR 44 §6.1).
 *   - 기본값 전부 'passthrough' → rollout 직후 행동 변화 없음 (ADR 44 §6.3 마지막 줄).
 *
 * env 키 (6개):
 *   OPENAI_CONTEXT_SHAPER, CLAUDE_CONTEXT_SHAPER, DEEPSEEK_CONTEXT_SHAPER,
 *   DEEPSEEK_REASONER_CONTEXT_SHAPER, DASHSCOPE_CONTEXT_SHAPER, OLLAMA_CONTEXT_SHAPER,
 *   DEFAULT_CONTEXT_SHAPER
 *
 * @injectable — NestJS DI 에서 직접 주입 가능. ConfigService 의존.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelType } from '../registry/prompt-registry.types';
import {
  ActiveShaperInfo,
  ContextShaper,
  ShaperId,
  ShaperResolveOptions,
} from './shaper.types';
import { passthroughShaper } from './PassthroughShaper';
import { jokerHinterShaper } from './JokerHinterShaper';
import { pairWarmupShaper } from './PairWarmupShaper';

@Injectable()
export class ShaperRegistry implements OnModuleInit {
  private readonly logger = new Logger(ShaperRegistry.name);

  /** id → ContextShaper 인스턴스 */
  private readonly shapers = new Map<string, ContextShaper>();

  /** ModelType → shaperId (per-model env override) */
  private readonly perModelOverrides = new Map<ModelType, ShaperId>();

  /** DEFAULT_CONTEXT_SHAPER env — null 이면 'passthrough' 내장 기본값 사용 */
  private globalShaperId: ShaperId | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.registerBuiltins();
    this.loadEnvironmentOverrides();
    this.logActiveConfiguration();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * 모델 타입에 적절한 Shaper 를 반환한다.
   * 우선순위는 클래스 docstring §우선순위 참조.
   * 미등록 id 는 passthrough 로 fallback.
   */
  resolve(
    modelType: ModelType,
    opts: ShaperResolveOptions = {},
  ): ContextShaper {
    const shaperId = this.resolveShaperId(modelType, opts);
    const shaper = this.shapers.get(shaperId);

    if (!shaper) {
      this.logger.warn(
        `[ShaperRegistry] 미등록 shaper id="${shaperId}" → passthrough fallback (modelType=${modelType})`,
      );
      return passthroughShaper;
    }

    return shaper;
  }

  /** 현재 모델의 active shaper 정보 조회 — admin/diagnostic 용 */
  getActive(modelType: ModelType): ActiveShaperInfo {
    if (this.perModelOverrides.has(modelType)) {
      return {
        modelType,
        shaperId: this.perModelOverrides.get(modelType)!,
        source: 'env-per-model',
      };
    }
    if (this.globalShaperId !== null) {
      return {
        modelType,
        shaperId: this.globalShaperId,
        source: 'env-global',
      };
    }
    return {
      modelType,
      shaperId: 'passthrough',
      source: 'builtin-default',
    };
  }

  /** 등록된 모든 Shaper 목록 — admin/diagnostic 용 */
  list(): ContextShaper[] {
    return Array.from(this.shapers.values());
  }

  /**
   * Shaper 등록 — 외부 모듈이 커스텀 Shaper 를 주입할 때 사용.
   * 동일 id 재등록 시 덮어쓰기 + warn 로그.
   */
  register(shaper: ContextShaper): void {
    if (this.shapers.has(shaper.id)) {
      this.logger.warn(`[ShaperRegistry] shaper 덮어쓰기: id="${shaper.id}"`);
    }
    this.shapers.set(shaper.id, shaper);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private registerBuiltins(): void {
    this.register(passthroughShaper);
    this.register(jokerHinterShaper);
    this.register(pairWarmupShaper);
  }

  private loadEnvironmentOverrides(): void {
    const global = this.configService.get<string>('DEFAULT_CONTEXT_SHAPER');
    if (global && global.length > 0) {
      this.globalShaperId = global as ShaperId;
    }

    // per-model override — PromptRegistry 의 perModelEnvKeys 와 대칭
    const perModelEnvKeys: Array<[ModelType, string]> = [
      ['openai', 'OPENAI_CONTEXT_SHAPER'],
      ['claude', 'CLAUDE_CONTEXT_SHAPER'],
      ['deepseek', 'DEEPSEEK_CONTEXT_SHAPER'],
      ['deepseek-reasoner', 'DEEPSEEK_REASONER_CONTEXT_SHAPER'],
      ['dashscope', 'DASHSCOPE_CONTEXT_SHAPER'],
      ['ollama', 'OLLAMA_CONTEXT_SHAPER'],
    ];

    for (const [modelType, envKey] of perModelEnvKeys) {
      const v = this.configService.get<string>(envKey);
      if (v && v.length > 0) {
        this.perModelOverrides.set(modelType, v as ShaperId);
      }
    }
  }

  private resolveShaperId(
    modelType: ModelType,
    opts: ShaperResolveOptions,
  ): ShaperId {
    // 1. 코드 명시 지정 (테스트/실험 오버라이드)
    if (opts.shaperId) return opts.shaperId;
    // 2. per-model env override
    if (this.perModelOverrides.has(modelType)) {
      return this.perModelOverrides.get(modelType)!;
    }
    // 3. global env override
    if (this.globalShaperId !== null) {
      return this.globalShaperId;
    }
    // 4. 내장 기본값 — 항상 passthrough (v2 baseline 호환)
    return 'passthrough';
  }

  private logActiveConfiguration(): void {
    const ids = Array.from(this.shapers.keys()).join(',');
    const overrides = Array.from(this.perModelOverrides.entries())
      .map(([m, s]) => `${m}:${s}`)
      .join(',');
    this.logger.log(
      `[ShaperRegistry] 등록=[${ids}] global=${this.globalShaperId ?? '(none→passthrough)'} per-model=[${overrides || '(none)'}]`,
    );
  }
}
