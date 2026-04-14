# 39. PromptRegistry 아키텍처 설계 (SP2 작업 A)

- **작성일**: 2026-04-14 (Sprint 6 Day 3 오후)
- **작성자**: architect-1 (Task #19 SP2 작업 A)
- **목적**: 4개 어댑터(OpenAI/Claude/DeepSeek/DashScope/Ollama)에 분산된 프롬프트 v2/v3/v3-tuned/v4를 단일 레지스트리로 통합하여 A/B 실험과 버저닝을 가능하게 한다.
- **선후 관계**:
  - 의존: SP1 v4 공통 System Prompt 설계 문서 (Task #18, 동시 진행)
  - 출력: SP3 구현(Task #20)이 본 인터페이스 규격을 그대로 사용
- **자율 결정 원칙**: 옵션 제시 금지, 트레이드오프 즉시 결정 후 근거 명시

---

## 1. Executive Summary

### 1.1 한 줄 요약

현재 5개 어댑터에 **4가지 다른 경로**로 분산된 프롬프트 선택 로직을 `PromptRegistry` 단일 진입점으로 통합한다. `PROMPT_VARIANT=v3` 환경변수 1개로 모든 어댑터의 프롬프트를 일관되게 토글한다.

### 1.2 핵심 결정 (즉시 채택)

| 결정 | 선택 | 근거 |
|------|------|------|
| **레지스트리 위치** | `src/ai-adapter/src/prompt/registry/` (신규 디렉토리) | 기존 `prompt/` 와 같은 NestJS provider 트리 안에 두면 DI 통합이 자명 |
| **변형 키 형식** | `<base>[-<modifier>]` (예: `v3`, `v3-tuned`, `v4`, `v4-thinking`) | 어댑터별 분기는 metadata로 표현, 키는 평면 |
| **모델 매핑 정책** | 변형 1개당 모든 모델 공유 (단일 텍스트) — 모델별 분기는 metadata.modelHints로 처리 | "DeepSeek가 v2면 OpenAI도 v2" 동기화가 사고 사전 방지 |
| **로딩 시점** | 모듈 부트(`OnModuleInit`)에 1회 — 변형 추가는 hot-reload 비대상 | 프로덕션은 컨테이너 재시작이 표준, 개발은 nest dev 자체가 reload |
| **토글 방식** | 환경변수 `PROMPT_VARIANT` 단일 + 어댑터별 override `<MODEL>_PROMPT_VARIANT` | 다중 모델 동시 A/B 실험 지원 |
| **메타데이터 저장** | 인메모리만 (Redis/PG 미사용) — 실험 결과는 기존 `metrics.service.ts` 에 prompt_id 컬럼만 추가 | 레지스트리는 정의 책임만, 결과 저장은 metrics가 전담 |

### 1.3 SP3가 그대로 구현해야 할 핵심 인터페이스

```typescript
// src/ai-adapter/src/prompt/registry/prompt-registry.service.ts
@Injectable()
export class PromptRegistry implements OnModuleInit {
  resolve(modelType: ModelType, variant?: string): PromptVariant;
  list(): PromptVariant[];
  getActiveVariant(modelType: ModelType): string;
}

interface PromptVariant {
  id: string;                    // "v3-tuned"
  version: string;               // "1.0.0"
  baseVariant?: string;          // "v3" (상속 관계 추적)
  systemPromptBuilder: () => string;
  userPromptBuilder: (gameState: GameStateDto) => string;
  retryPromptBuilder: (gameState: GameStateDto, errorReason: string, attempt: number) => string;
  metadata: PromptMetadata;
}

interface PromptMetadata {
  description: string;
  tokenBudget: number;           // ~1530
  recommendedModels: ModelType[];// ['deepseek-reasoner', 'qwen3']
  recommendedTemperature: number;// 0.0
  designDoc: string;             // 'docs/02-design/24-v3-prompt-adapter-impact.md'
  introducedAt: string;          // '2026-04-08'
  experimentTag?: string;        // 'A' | 'B' for active experiments
  thinkingMode?: 'standard' | 'extended' | 'thinking-only';
}
```

전체 인터페이스는 §6 참조.

---

## 2. 현재 파편화 현황 (전수 조사)

### 2.1 5개 어댑터 × 프롬프트 경로 매트릭스

| 어댑터 | 기본 경로 | 환경변수 | 사용 프롬프트 | 파일 |
|--------|----------|---------|------------|------|
| **OpenAI** | `super.generateMove()` → `PromptBuilderService.buildSystemPrompt` → 한국어 캐릭터 템플릿 | `USE_V2_PROMPT=true` 시 V2_REASONING_SYSTEM_PROMPT | v2 (영문) **또는** 캐릭터 한국어 | `openai.adapter.ts:78-82,86` |
| **Claude** | 동일 | `USE_V2_PROMPT=true` 동일 | v2 (영문) **또는** 캐릭터 한국어 | `claude.adapter.ts:84-95` |
| **DeepSeek (chat)** | 기본 경로 | 없음 | 캐릭터 한국어 | `deepseek.adapter.ts:76` |
| **DeepSeek (reasoner)** | `generateMove()` 오버라이드 | 없음 (모델명에 'reasoner' 포함 시 자동) | **V2 강제** (V3 미사용!) | `deepseek.adapter.ts:80-82` |
| **DashScope (Qwen3)** | 자체 경로 | 없음 | **V3 강제** | `dashscope/prompt-builder.ts:23` |
| **Ollama** | 기본 경로 | 없음 | 캐릭터 한국어 | `ollama.adapter.ts` |

### 2.2 결정적 발견

#### 🔴 발견 1 — `prompt-v3-tuned.ts` 는 dead code 다

```bash
$ grep -r "prompt-v3-tuned" src/ai-adapter/src/
src/ai-adapter/src/adapter/deepseek/prompt-v3-tuned.ts:21:  // doc 주석에서만 언급
```

- 파일 자체는 381줄 존재, `V3_TUNED_REASONING_SYSTEM_PROMPT` export
- **import 하는 코드 0건** — `deepseek.adapter.ts` 에서 환경변수 `DEEPSEEK_PROMPT_VERSION` 도 미사용
- 즉 v3-tuned 는 **C2 작업으로 만들어졌으나 아직 어떤 어댑터에도 연결되지 않은 상태**
- 본 SP2/SP3 에서 PromptRegistry로 등록하면 비로소 사용 가능해짐

#### 🔴 발견 2 — DeepSeek Reasoner 가 V3 가 아니라 V2 를 쓰고 있다

`deepseek.adapter.ts:82` 에서 `systemPrompt = V2_REASONING_SYSTEM_PROMPT` 로 V2 하드코딩. 그러나:
- `docs/02-design/24-v3-prompt-adapter-impact.md` 는 v3 도입을 권고
- DashScope 는 v3 사용 (`dashscope/prompt-builder.ts:23`)
- **DeepSeek-Reasoner가 v3 으로 한 번도 운영된 적이 없음** (Round 4~5 30.8% place rate 는 모두 v2 결과)

이는 SP3 구현 시점에서 **즉시 전환할 수 있는 무비용 개선**이다. PromptRegistry 도입 후 `PROMPT_VARIANT=v3` 1줄로 DeepSeek-Reasoner를 v3 으로 전환 가능 → 다음 대전에서 차이 측정.

#### 🔴 발견 3 — `USE_V2_PROMPT` 환경변수는 OpenAI/Claude만 인지

DeepSeek-Reasoner는 `USE_V2_PROMPT` 와 무관하게 항상 V2. DashScope는 무관하게 항상 V3. Ollama는 캐릭터 한국어 고정. **5개 어댑터가 5가지 다른 토글 의미체계**를 가짐.

### 2.3 통합 후 단순화

```
[BEFORE]
USE_V2_PROMPT=true                  → OpenAI, Claude만 v2 전환
(모델명에 'reasoner' 포함)            → DeepSeek 자동 v2
(없음)                                → DashScope 항상 v3
(없음)                                → Ollama 항상 한국어 캐릭터

[AFTER]
PROMPT_VARIANT=v3                    → 5개 어댑터 전부 v3 (DashScope/DeepSeek/OpenAI/Claude/Ollama)
DEEPSEEK_PROMPT_VARIANT=v3-tuned     → DeepSeek만 별도 변형 (per-model override)
PROMPT_VARIANT=v4-thinking           → SP1 v4 도입 후
```

---

## 3. 아키텍처 결정 사항 (ADR-style)

### ADR-021 — PromptRegistry를 NestJS provider로 도입한다

**Status**: Accepted (2026-04-14)
**Context**: 5개 어댑터 × 4가지 분산 프롬프트 → 토글 의미체계 5가지. v3 도입 후에도 DeepSeek-Reasoner가 v2 로 운영되는 무지각 사고 발생.
**Decision**: `PromptRegistry` 를 단일 source of truth로 도입. 모든 어댑터는 `PromptRegistry.resolve(modelType, variant?)` 만 호출.
**Consequences**:
- (+) 어댑터 코드 80% 단순화 (각 어댑터의 v2/v3 분기 제거)
- (+) `PROMPT_VARIANT` 환경변수 1개로 일괄 전환
- (+) A/B 실험: `OPENAI_PROMPT_VARIANT=v3 CLAUDE_PROMPT_VARIANT=v3-tuned` 동시 운영
- (−) 추가 클래스 1개 + 변형 등록 boilerplate (~30줄/변형)
- (−) 어댑터 단위 테스트 mocking 깊이 1단계 증가

**Alternatives Considered**:
- (a) 환경변수 표준화만 — 코드 분기 잔존, A/B 어려움 → 거부
- (b) Strategy 패턴을 어댑터 내부에 — 5개 어댑터마다 동일 패턴 반복 → 거부
- (c) Database 기반 동적 로딩 — 16GB RAM 제약과 운영 단순성 위배 → 거부

---

### ADR-022 — 변형 키 형식: `<base>[-<modifier>]` 평면 네임스페이스

**Status**: Accepted
**Context**: v2 / v3 / v3-tuned / v4 / v4-thinking / v4-deepseek 등 향후 변형 폭증 가능.
**Decision**: 평면 키. 계층 구조(`v3.tuned.deepseek`)는 사용 안 함. 모델별 분기는 metadata.recommendedModels로 표현.
**Consequences**:
- (+) registry.resolve('v3-tuned') 한 줄 lookup
- (+) 환경변수 매핑 직관적 (`PROMPT_VARIANT=v3-tuned`)
- (−) 같은 base에 modifier가 많아지면 중복 발생 가능 (예: v3-tuned, v3-deepseek, v3-tuned-deepseek)
- 완화: 변형 8개 초과 시 `prompt-registry.config.ts` 분리 + lint rule 추가

**Naming Rule**:
- `<base>`: 메이저 버전 (v2, v3, v4)
- `<modifier>`: hyphen 1개 + 알파 영문 (`tuned`, `thinking`, `deepseek`, `qwen3`)
- 다중 modifier 금지 (`v4-thinking-deepseek` ❌ → `v4-deepseek-thinking` 도 ❌). 필요 시 `v4dt` 와 같이 fused 표기 권장.

---

### ADR-023 — 변형 1개 = 모든 모델 공유 (단일 텍스트)

**Status**: Accepted
**Context**: 모델별로 미세하게 다른 텍스트를 운영하면 "DeepSeek가 v2면 OpenAI도 v2" 동기화 책임이 분산되고 누락 사고 발생 (실제로 DeepSeek-Reasoner가 v3 미반영).
**Decision**: 한 변형은 한 텍스트. 모델 hint(thinking mode, temperature, max_tokens)는 metadata로만 표현.
**Consequences**:
- (+) v3 도입 시 1줄 변경으로 모든 모델 동시 전환
- (+) 실험 디자인: "v3 vs v3-tuned" 가 명확 (한 변수만 변동)
- (−) 모델별 최적화 공간 손실 — 완화: 변형 추가(`v3-deepseek`)로 표현 가능
- (−) Qwen3-thinking 처럼 모델 특성 의존 변형 필요 시: 별도 variant 등록 (`v3-thinking-only`)

---

### ADR-024 — 메타데이터 저장은 인메모리, 실험 결과는 metrics 서비스

**Status**: Accepted
**Context**: 변형 정의(텍스트, builder)는 정적, 실험 결과(round_id, place_rate)는 동적.
**Decision**: PromptRegistry는 정의만 보유. 실험 결과는 `MetricsService` 에 `prompt_id` 컬럼 추가.
**Consequences**:
- (+) 레지스트리는 빌드 타임 자산 — 테스트 mocking 단순
- (+) 결과 분석은 기존 `cost-tracking.service.ts` + `metrics.service.ts` 흐름 재사용
- (−) "현재 active variant" 조회는 별도 API 필요 — 완화: `registry.getActiveVariant(modelType)` 메서드 1개로 해결

---

## 4. PromptRegistry 클래스 설계

### 4.1 디렉토리 구조

```
src/ai-adapter/src/prompt/
├── registry/                          ← 신규 (SP3에서 생성)
│   ├── prompt-registry.module.ts
│   ├── prompt-registry.service.ts
│   ├── prompt-registry.types.ts
│   ├── prompt-registry.service.spec.ts
│   └── variants/
│       ├── v2.variant.ts              ← v2-reasoning-prompt.ts wrapper
│       ├── v3.variant.ts              ← v3-reasoning-prompt.ts wrapper
│       ├── v3-tuned.variant.ts        ← prompt-v3-tuned.ts wrapper (살림!)
│       └── v4.variant.ts              ← SP1 산출물 기반 (Sprint 6 후반)
├── v2-reasoning-prompt.ts             ← 기존 (텍스트 본문, registry가 wrapping)
├── v3-reasoning-prompt.ts             ← 기존 (동일)
├── persona.templates.ts               ← 기존 (legacy fallback, registry가 'character-ko' variant 로 등록)
└── prompt-builder.service.ts          ← 기존 — 점진적으로 deprecated → registry로 위임
```

### 4.2 타입 정의 (`prompt-registry.types.ts`)

```typescript
import { GameStateDto } from '../../common/dto/move-request.dto';

export type ModelType =
  | 'openai'
  | 'claude'
  | 'deepseek'
  | 'deepseek-reasoner'
  | 'dashscope'
  | 'ollama';

export type ThinkingMode = 'standard' | 'extended' | 'thinking-only';

export interface PromptMetadata {
  /** 사람이 읽기 위한 한 줄 설명 */
  description: string;
  /** 토큰 예산 (system prompt만, user prompt 제외) */
  tokenBudget: number;
  /** 이 변형에 가장 적합한 모델들 — registry가 자동 매핑에 사용 */
  recommendedModels: ModelType[];
  /** 권장 temperature (어댑터가 callLlm 호출 시 사용) */
  recommendedTemperature: number;
  /** 설계 문서 경로 (PR 리뷰어가 참조) */
  designDoc: string;
  /** YYYY-MM-DD */
  introducedAt: string;
  /** A/B 실험 태그 — 활성 실험 시 'A' | 'B' */
  experimentTag?: 'A' | 'B' | string;
  /** 추론 모델 thinking 모드 */
  thinkingMode?: ThinkingMode;
  /** 이 변형이 권장 모델 외에서 사용될 때 경고 출력 여부 */
  warnIfOffRecommendation?: boolean;
}

export interface PromptVariant {
  /** "v3-tuned" — kebab-case, 환경변수 PROMPT_VARIANT 값과 동일 */
  id: string;
  /** semver — 같은 id의 minor 개정 추적 (v3.0.1 등) */
  version: string;
  /** 상속 관계 — "v3-tuned"의 baseVariant는 "v3" */
  baseVariant?: string;
  /** 시스템 프롬프트 빌더 (인자 없음 — 정적) */
  systemPromptBuilder: () => string;
  /** 유저 프롬프트 빌더 (게임 상태 의존) */
  userPromptBuilder: (gameState: GameStateDto) => string;
  /** 재시도 프롬프트 빌더 */
  retryPromptBuilder: (
    gameState: GameStateDto,
    errorReason: string,
    attempt: number,
  ) => string;
  /** 메타데이터 */
  metadata: PromptMetadata;
}

export interface ResolveOptions {
  /** override 변형 id — 없으면 환경변수에서 로드 */
  variantId?: string;
  /** A/B 실험 모드: 'A' / 'B' 중 하나 강제 */
  experimentTag?: 'A' | 'B';
}

export interface ActiveVariantInfo {
  modelType: ModelType;
  variantId: string;
  source: 'env-global' | 'env-per-model' | 'default-recommendation' | 'fallback';
}
```

### 4.3 PromptRegistry 서비스 (`prompt-registry.service.ts`)

```typescript
import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ModelType,
  PromptVariant,
  ResolveOptions,
  ActiveVariantInfo,
} from './prompt-registry.types';
import { v2Variant } from './variants/v2.variant';
import { v3Variant } from './variants/v3.variant';
import { v3TunedVariant } from './variants/v3-tuned.variant';
// import { v4Variant } from './variants/v4.variant'; // Sprint 6 후반 SP1 완료 후

@Injectable()
export class PromptRegistry implements OnModuleInit {
  private readonly logger = new Logger(PromptRegistry.name);
  private readonly variants = new Map<string, PromptVariant>();
  private readonly perModelOverrides = new Map<ModelType, string>();
  private globalVariantId = 'v2'; // 기본값 — onModuleInit에서 env로 덮어씀

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.registerBuiltinVariants();
    this.loadEnvironmentOverrides();
    this.logActiveConfiguration();
  }

  /**
   * 모델 타입에 적절한 변형을 반환한다.
   *
   * 우선순위:
   *   1. opts.variantId (명시 지정)
   *   2. <MODEL>_PROMPT_VARIANT 환경변수
   *   3. PROMPT_VARIANT 글로벌 환경변수
   *   4. 모델별 default recommendation (registry 내장 매핑)
   *   5. 'v2' fallback
   */
  resolve(modelType: ModelType, opts: ResolveOptions = {}): PromptVariant {
    const variantId = this.resolveVariantId(modelType, opts);
    const variant = this.variants.get(variantId);
    if (!variant) {
      this.logger.warn(
        `[PromptRegistry] 변형 미등록: ${variantId} → v2로 fallback`,
      );
      return this.variants.get('v2')!;
    }

    if (
      variant.metadata.warnIfOffRecommendation &&
      !variant.metadata.recommendedModels.includes(modelType)
    ) {
      this.logger.warn(
        `[PromptRegistry] ${variantId}는 ${modelType}에 권장되지 않음 (recommendedModels=${variant.metadata.recommendedModels.join(',')})`,
      );
    }

    return variant;
  }

  /** 모든 등록 변형 목록 — admin/diagnostic용 */
  list(): PromptVariant[] {
    return Array.from(this.variants.values());
  }

  /** 특정 모델 타입의 현재 active variant id 조회 */
  getActiveVariant(modelType: ModelType): ActiveVariantInfo {
    if (this.perModelOverrides.has(modelType)) {
      return {
        modelType,
        variantId: this.perModelOverrides.get(modelType)!,
        source: 'env-per-model',
      };
    }
    const globalEnv = this.configService.get<string>('PROMPT_VARIANT');
    if (globalEnv) {
      return {
        modelType,
        variantId: globalEnv,
        source: 'env-global',
      };
    }
    return {
      modelType,
      variantId: this.defaultForModel(modelType),
      source: 'default-recommendation',
    };
  }

  /** 변형 등록 — 외부 모듈이 추가 변형을 등록할 때 사용 */
  register(variant: PromptVariant): void {
    if (this.variants.has(variant.id)) {
      this.logger.warn(
        `[PromptRegistry] 변형 덮어쓰기: ${variant.id} (이전 version=${this.variants.get(variant.id)!.version})`,
      );
    }
    this.variants.set(variant.id, variant);
  }

  // ---- private ----

  private registerBuiltinVariants(): void {
    this.register(v2Variant);
    this.register(v3Variant);
    this.register(v3TunedVariant);
    // SP1 완료 후 추가:
    // this.register(v4Variant);
    // this.register(v4ThinkingVariant);
  }

  private loadEnvironmentOverrides(): void {
    const global = this.configService.get<string>('PROMPT_VARIANT');
    if (global) this.globalVariantId = global;

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
      if (v) this.perModelOverrides.set(modelType, v);
    }
  }

  private resolveVariantId(modelType: ModelType, opts: ResolveOptions): string {
    if (opts.variantId) return opts.variantId;
    if (this.perModelOverrides.has(modelType)) {
      return this.perModelOverrides.get(modelType)!;
    }
    if (this.globalVariantId !== 'v2') {
      return this.globalVariantId;
    }
    return this.defaultForModel(modelType);
  }

  private defaultForModel(modelType: ModelType): string {
    // Registry 내장 권장 매핑.
    // SP3 구현 시 §5의 "권장 변형 매핑표" 그대로 사용.
    const map: Record<ModelType, string> = {
      'openai': 'v2',                  // gpt-5-mini 추론모델 — v2 검증됨
      'claude': 'v2',                  // claude-sonnet-4 — v2 + extended thinking
      'deepseek': 'v2',                // deepseek-chat — v2
      'deepseek-reasoner': 'v3',       // ★ 변경: v2 → v3 (v3가 검증된 권장값)
      'dashscope': 'v3',               // qwen3 thinking — v3
      'ollama': 'v2',                  // qwen2.5:3b — v2 (소형 모델)
    };
    return map[modelType] ?? 'v2';
  }

  private logActiveConfiguration(): void {
    this.logger.log(
      `[PromptRegistry] 등록 변형=${Array.from(this.variants.keys()).join(',')} 글로벌=${this.globalVariantId} per-model-override=${Array.from(this.perModelOverrides.entries()).map(([m, v]) => `${m}:${v}`).join(',')}`,
    );
  }
}
```

### 4.4 Variant 정의 예시 (`variants/v3.variant.ts`)

```typescript
import {
  V3_REASONING_SYSTEM_PROMPT,
  buildV3UserPrompt,
  buildV3RetryPrompt,
} from '../../v3-reasoning-prompt';
import { PromptVariant } from '../prompt-registry.types';

export const v3Variant: PromptVariant = {
  id: 'v3',
  version: '1.0.0',
  baseVariant: 'v2',
  systemPromptBuilder: () => V3_REASONING_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV3UserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV3RetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description: 'v2 기반 무효 배치 감소 + 자기검증 강화',
    tokenBudget: 1530,
    recommendedModels: ['deepseek-reasoner', 'dashscope', 'openai', 'claude'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/02-design/24-v3-prompt-adapter-impact.md',
    introducedAt: '2026-04-08',
    thinkingMode: 'standard',
    warnIfOffRecommendation: false,
  },
};
```

`variants/v3-tuned.variant.ts` 도 동일 패턴 — 기존 `prompt-v3-tuned.ts` 의 export 들을 wrapping.

---

## 5. 권장 변형 매핑표 (SP3 default)

| ModelType | 기본 (PROMPT_VARIANT 미설정) | 권장 사유 |
|-----------|----------------------------|---------|
| `openai` (gpt-5-mini 추론) | `v2` | Round 4 검증, gpt-5-mini는 v2 + 자체 reasoning |
| `claude` (claude-sonnet-4) | `v2` | Extended thinking + v2 검증, A등급 |
| `deepseek` (deepseek-chat) | `v2` | 비추론 모델, v2 충분 |
| `deepseek-reasoner` | **`v3`** ★ | **현재 v2 하드코딩 → v3 권장으로 전환 (무비용 개선)** |
| `dashscope` (qwen3-thinking) | `v3` | 기존 그대로 (이미 v3 사용 중) |
| `ollama` (qwen2.5:3b) | `v2` | 소형 모델, v3 토큰 예산 부담 |

**SP3 머지 시 1라인 효과**:
환경변수 변경 없이 PromptRegistry만 도입해도 DeepSeek-Reasoner가 자동 v3 으로 전환됨 → 다음 대전(Sprint 6 후반 DeepSeek 단독 multirun)에서 v2 vs v3 비교 가능. 대신 SP3 PR 본문에 **"behavior change: DeepSeek-Reasoner v2→v3 자동 전환"** 명시 필수.

---

## 6. SP3 구현 인터페이스 규격 (확정)

> SP3(Task #20) node-dev-1 이 본 절을 그대로 참조하여 코드를 작성한다. 추가 합의 불필요.

### 6.1 신규 파일 (10건)

```
src/ai-adapter/src/prompt/registry/
├── prompt-registry.module.ts          # NestJS module export
├── prompt-registry.service.ts         # PromptRegistry @Injectable
├── prompt-registry.service.spec.ts    # 12 테스트 (§6.4 참조)
├── prompt-registry.types.ts           # interfaces
├── index.ts                           # barrel
└── variants/
    ├── v2.variant.ts                  # V2 wrapper
    ├── v3.variant.ts                  # V3 wrapper
    ├── v3-tuned.variant.ts            # V3-tuned wrapper (dead code 부활)
    ├── character-ko.variant.ts        # legacy persona.templates.ts wrapper
    └── README.md                      # 변형 추가 가이드 (한 페이지)
```

### 6.2 수정 파일 (6건)

| 파일 | 변경 내용 |
|------|---------|
| `src/ai-adapter/src/app.module.ts` | `PromptRegistryModule` import |
| `src/ai-adapter/src/adapter/openai.adapter.ts` | `USE_V2_PROMPT` 로직 → `promptRegistry.resolve('openai')` 호출로 단순화. V2 import 제거 |
| `src/ai-adapter/src/adapter/claude.adapter.ts` | 동일 |
| `src/ai-adapter/src/adapter/deepseek.adapter.ts` | reasoner 분기에서 V2 하드코딩 → `promptRegistry.resolve('deepseek-reasoner')` |
| `src/ai-adapter/src/adapter/dashscope/dashscope.service.ts` | dashscope/prompt-builder.ts 직접 import → `promptRegistry.resolve('dashscope')` |
| `src/ai-adapter/src/adapter/ollama.adapter.ts` | super.generateMove 위임 (변경 적음) — registry 통한 default-recommendation 사용 |

### 6.3 deletion (Sprint 6 후반, SP3 머지 후 별도 PR)

- `src/ai-adapter/src/adapter/dashscope/prompt-builder.ts` — registry로 흡수되면 삭제 가능. SP3 PR에서는 deprecated 주석만, 삭제는 후속 PR.

### 6.4 테스트 명세 (`prompt-registry.service.spec.ts`, 12건)

```typescript
describe('PromptRegistry', () => {
  describe('resolve()', () => {
    it('환경변수 PROMPT_VARIANT=v3 설정 시 모든 모델이 v3 반환');
    it('per-model override DEEPSEEK_PROMPT_VARIANT=v3-tuned 가 글로벌보다 우선');
    it('opts.variantId 가 환경변수보다 우선');
    it('미등록 variantId 요청 시 v2로 fallback + warn 로그');
    it('warnIfOffRecommendation=true 변형이 비권장 모델에 사용되면 경고');
  });

  describe('default mapping', () => {
    it('환경변수 없을 때 deepseek-reasoner는 v3 반환 (★ 행동 변경)');
    it('환경변수 없을 때 dashscope는 v3 반환');
    it('환경변수 없을 때 openai는 v2 반환');
  });

  describe('list() / getActiveVariant()', () => {
    it('list()는 등록된 모든 변형 반환');
    it('getActiveVariant()는 source 정확히 표기 (env-global / env-per-model / default-recommendation)');
  });

  describe('register()', () => {
    it('동일 id 재등록 시 덮어쓰기 + warn');
    it('SP4 실험 프레임워크가 register() 호출로 임시 변형 주입 가능');
  });
});
```

### 6.5 Helm/환경변수 추가

`helm/charts/ai-adapter/values.yaml` 에 환경변수 6개 추가 (모두 빈 문자열 default — registry default-recommendation에 위임):

```yaml
env:
  PROMPT_VARIANT: ""                  # 글로벌 override (예: "v3")
  OPENAI_PROMPT_VARIANT: ""
  CLAUDE_PROMPT_VARIANT: ""
  DEEPSEEK_PROMPT_VARIANT: ""
  DEEPSEEK_REASONER_PROMPT_VARIANT: ""
  DASHSCOPE_PROMPT_VARIANT: ""
  OLLAMA_PROMPT_VARIANT: ""
```

기존 `USE_V2_PROMPT` 는 deprecated 마킹 + Sprint 7에 삭제. SP3 PR 본문에 **migration guide 1단락** 포함.

### 6.6 Backward compatibility

- SP3 머지 직후: `USE_V2_PROMPT=true` 환경변수가 설정되어 있으면 PromptRegistry가 시작 시 감지하여 `globalVariantId='v2'` 강제 + deprecation warning 1회 출력. Sprint 7에 제거.
- 기존 `prompt-builder.service.ts` 의 `buildSystemPrompt()` 는 그대로 유지 (legacy fallback). registry는 `character-ko` variant 로 등록하여 ollama가 그대로 사용.

---

## 7. 실험 메타데이터 저장 스키마

> **결정**: 실험 결과 저장은 PromptRegistry의 책임 아님. 기존 `metrics.service.ts` 에 컬럼 1개만 추가.

### 7.1 기존 metrics 흐름 (변경 없음)

```
adapter.generateMove()
  → llm 호출
  → metrics.service.ts: recordInvocation({modelType, latencyMs, tokens, ...})
  → cost-tracking.service.ts: recordCost({modelType, totalCostUsd})
  → PostgreSQL llm_metrics 테이블
```

### 7.2 SP3에서 추가할 1개 컬럼 + 1개 필드

```diff
// metrics.service.ts InvocationRecord interface
interface InvocationRecord {
  modelType: ModelType;
  modelName: string;
  gameId: string;
+ promptVariantId: string;        // ★ "v3" / "v3-tuned" / "v2" 등
+ promptVariantVersion: string;   // ★ "1.0.0"
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  isFallback: boolean;
  // ...
}
```

PostgreSQL 마이그레이션 (SP3 PR 1건):
```sql
ALTER TABLE llm_metrics
  ADD COLUMN prompt_variant_id VARCHAR(32) NOT NULL DEFAULT 'v2',
  ADD COLUMN prompt_variant_version VARCHAR(16) NOT NULL DEFAULT '1.0.0';
CREATE INDEX idx_llm_metrics_prompt_variant ON llm_metrics(prompt_variant_id, model_type);
```

이후 SP4(A/B 실험 프레임워크)는 이 컬럼만 group-by 해서 결과 분석.

---

## 8. SP4(A/B 실험) ↔ SP5(v4 베이스라인) 흐름

본 SP2/SP3가 깔아둔 인프라 위에서:

1. **SP4** (Task #21) — 결정론 드라이런 프레임워크
   - `register()` 메서드로 임시 variant `v3-experiment-A` / `v3-experiment-B` 등록
   - Playtest harness가 두 variant 를 50:50 분할하여 동일 게임 시드로 실행
   - metrics 컬럼 `prompt_variant_id` 그룹화 → place_rate, fallback rate 비교

2. **SP5** (Task #22) — v4 베이스라인
   - SP1(Task #18) 이 만들 v4 system prompt 가 `variants/v4.variant.ts` 로 등록
   - `PROMPT_VARIANT=v4` 환경변수 1개로 전체 5개 모델에 v4 적용
   - 베이스라인 대전 결과를 통합 리포트로 작성

---

## 9. 마이그레이션 계획 (SP3 PR 1건으로 완결)

### 9.1 머지 직전 체크리스트

- [ ] PromptRegistry 12 unit test 전수 PASS
- [ ] OpenAI/Claude/DeepSeek/DashScope/Ollama 어댑터 spec 모두 PASS (registry mock 주입)
- [ ] `USE_V2_PROMPT=true` 회귀 테스트 (deprecation warn 출력 + v2 동작 유지)
- [ ] `PROMPT_VARIANT=v3` 설정 시 5개 어댑터 통합 테스트 (각각 V3_REASONING_SYSTEM_PROMPT 출력 확인)
- [ ] PostgreSQL 마이그레이션 dry-run + rollback 스크립트
- [ ] SP3 PR 본문에 **"behavior change: DeepSeek-Reasoner default v2→v3"** 명시 + 다음 대전 영향 1줄

### 9.2 머지 후 즉시 검증

- DeepSeek-Reasoner 단독 1게임 실행 → 시스템 프롬프트 로그가 V3_REASONING_SYSTEM_PROMPT 시작 라인과 일치하는지 grep
- `metrics` 테이블 신규 row 의 `prompt_variant_id='v3'` 확인

### 9.3 SP3 머지 후 1주 동안

- 기존 `USE_V2_PROMPT=true` 운영 중인 환경 (있다면) 의 deprecation warning 모니터
- A/B 실험 1건 시범 운영: `OPENAI_PROMPT_VARIANT=v3 CLAUDE_PROMPT_VARIANT=v3-tuned` 로 동시 다른 변형 실행

---

## 10. 위험 및 완화

| 위험 | 가능성 | 영향 | 완화 |
|------|-------|------|------|
| DeepSeek-Reasoner v2→v3 자동 전환으로 place rate 회귀 | 중 | 중 | (1) PR 본문 명시 (2) SP3 머지 직후 단독 1게임 smoke test (3) 회귀 시 즉시 `DEEPSEEK_REASONER_PROMPT_VARIANT=v2` 환경변수 주입 |
| variant 등록 누락 → fallback 'v2' 폭주 | 낮 | 중 | onModuleInit 에서 변형 목록 로그 출력 + spec 테스트 |
| 어댑터 spec 의존성 변경 → 광범위 mock 수정 | 높 | 낮 | SP3 PR 1건에 모두 포함 — 기존 PromptBuilderService mock 패턴을 PromptRegistry mock 으로 1회 변환 |
| Registry circular dependency (NestJS DI) | 낮 | 높 | PromptRegistryModule 은 ConfigModule 외 dependency 없음 — 어댑터 모듈이 PromptRegistryModule 을 import 하는 단방향 |
| 환경변수 7개 폭증으로 운영 혼란 | 중 | 낮 | 평상시는 `PROMPT_VARIANT` 1개만 사용. per-model 6개는 A/B 실험 시에만 사용 + Helm values 주석에 명시 |

---

## 11. SP3 작업량 추정

| 항목 | 추정 |
|------|-----|
| 신규 파일 10건 | 4시간 |
| 어댑터 6개 수정 | 2시간 |
| Unit test 12건 | 2시간 |
| Adapter spec 회귀 (5개 spec mock 조정) | 2시간 |
| PostgreSQL 마이그레이션 + 검증 | 1시간 |
| Smoke test (DeepSeek 단독 1게임) | 1시간 |
| PR 본문 + migration guide | 0.5시간 |
| **합계** | **~12.5시간 (Sprint 6 후반 1.5일)** |

---

## 12. 참고

- `docs/02-design/24-v3-prompt-adapter-impact.md` — v3 도입 영향 분석
- `docs/02-design/21-reasoning-model-prompt-engineering.md` — 추론 모델 프롬프트 원칙
- `docs/02-design/34-dashscope-qwen3-adapter-design.md` — DashScope/Qwen3 어댑터
- `docs/03-development/19-deepseek-token-efficiency-analysis.md` — DeepSeek burst thinking 분석 (v3-tuned 근거)
- `src/ai-adapter/src/prompt/v3-reasoning-prompt.ts` — V3 본문
- `src/ai-adapter/src/adapter/deepseek/prompt-v3-tuned.ts` — V3-tuned 본문 (현재 dead code, SP3에서 부활)
- `src/ai-adapter/src/adapter/deepseek.adapter.ts:80-82` — reasoner V2 하드코딩 위치 (SP3 수정 대상)
- `docs/02-design/40-agent-commit-queue-design.md` — SP2 작업 B (본 SP2와 한 쌍)

---

## 13. 결론

본 설계는 **현재 5개 어댑터에 분산된 4가지 프롬프트 토글 의미체계를 단일 환경변수로 통합**하고, **DeepSeek-Reasoner의 v2→v3 무지각 누락 사고를 자동 해결**한다. SP3는 본 §6 인터페이스 규격을 그대로 구현하고, SP4/SP5/v4 도입은 본 인프라 위에서 자연스럽게 확장된다.

**핵심 즉시 효과 1건**: DeepSeek-Reasoner default가 v2 → v3 으로 전환되며, Round 4~5(30.8% A+) 결과를 v3로 재측정할 수 있게 된다. 이는 본 SP2 작업의 가장 큰 dividend.

**SP3 핸드오프**: node-dev-1 은 본 §4 클래스 설계 + §6 파일 목록 + §6.4 테스트 명세를 그대로 사용하여 단일 PR로 구현 가능. 추가 합의 불필요.
