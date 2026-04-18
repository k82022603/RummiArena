# 61. v2 프롬프트 글자 단위 비교 — PromptRegistry 전후 동등성 검증

- **작성일**: 2026-04-18 (Sprint 6 Day 8 아침)
- **작성자**: Claude (메인 세션, Opus 4.7 xhigh)
- **상태**: 확정 보고 — 원인 (C) 기각
- **소요 시간**: 20분 (Step 1 of Day 8 실행 계획)

---

## 1. 조사 목적

Round 9 Phase 2 재실측에서 v2 프롬프트가 30.8% → 25.6% 로 떨어진 현상의 원인 후보 중 **(C) 코드 경로 변경으로 프롬프트 텍스트가 의도치 않게 바뀜** 가설을 검증한다.

관련 커밋: `5ad02e8` (2026-04-14) — "PromptRegistry + v4 provider 통합 (SP3)"
- 이 커밋 이전: `deepseek.adapter.ts` 하드코딩 V2 경로
- 이 커밋 이후: `registry.resolve(modelType) → v2Variant` 경로

---

## 2. 코드 경로 추적

### 2.1 커밋 전 경로 (5ad02e8~1 기준)

```typescript
// src/ai-adapter/src/adapter/deepseek.adapter.ts (5ad02e8 이전)
import {
  V2_REASONING_SYSTEM_PROMPT,
  buildV2UserPrompt,
  buildV2RetryPrompt,
} from '../prompt/v2-reasoning-prompt';

// ...
const systemPrompt = V2_REASONING_SYSTEM_PROMPT;
const userPrompt = buildV2UserPrompt(request.gameState);
```

### 2.2 커밋 후 경로 (현재)

```typescript
// src/ai-adapter/src/prompt/registry/variants/v2.variant.ts
import {
  V2_REASONING_SYSTEM_PROMPT,
  buildV2UserPrompt,
  buildV2RetryPrompt,
} from '../../v2-reasoning-prompt';

export const v2Variant: PromptVariant = {
  id: 'v2',
  version: '1.0.0',
  systemPromptBuilder: () => V2_REASONING_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV2UserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV2RetryPrompt(gameState, errorReason, attempt),
  // ...
};
```

### 2.3 핵심 관찰

**두 경로 모두 동일한 파일 `src/ai-adapter/src/prompt/v2-reasoning-prompt.ts` 의 동일 심볼을 `import` 한다.** Registry 경로는 단순히 wrapper 레이어를 한 겹 추가했을 뿐, 프롬프트 텍스트 생성 로직은 바꾸지 않았다.

---

## 3. v2-reasoning-prompt.ts 변경 이력

```
$ git log --oneline src/ai-adapter/src/prompt/v2-reasoning-prompt.ts
aff958c feat: USE_V2_PROMPT 토글 — DeepSeek v2 영문 프롬프트를 GPT/Claude에 적용
```

- **단 한 개의 커밋** — 2026-04-05 `aff958c` 에서 파일 생성.
- 이후 **2026-04-18 오늘까지 13일간 0건 변경**.
- 5ad02e8 PromptRegistry 통합 커밋도 이 파일은 손대지 않았다 (`import` 경로만 wrapper 레이어를 통해 재구성).

---

## 4. Day 7 재실측 variant 경로 확인

`docs/04-testing/59-v2-zh-day7-battle-report.md` 및 당시 커밋(`cbad722`) 확인 결과, Day 7 Round 9 Phase 2(v2 재실측) 실행 전 아래 명령이 실행되었다.

```bash
kubectl -n rummikub set env deployment/ai-adapter DEEPSEEK_REASONER_PROMPT_VARIANT=v2
```

그리고 배치 종료 후 per-model override 를 제거(또는 v4 로 복원)했다. 즉 Day 7 재실측은 실제로 **v2 프롬프트** 로 돌아간 것이 확정.

`docs/02-design/42 §4` resolve 5단계 우선순위에 따라:

1. `opts.variantId` — 미사용
2. `perModelOverrides['deepseek-reasoner']` = **v2** (Day 7 당시 명시 설정)
3. `globalVariantId` (USE_V2_PROMPT) = 도달 안 함
4. `defaultForModel('deepseek-reasoner')` = 도달 안 함

→ 2단계에서 v2 로 확정. v2.variant.ts 경로로 `V2_REASONING_SYSTEM_PROMPT` 반환.

---

## 5. 결론

| 원인 후보 | 판정 | 근거 |
|----------|------|------|
| (A) DeepSeek 내부 모델 업데이트 | **검증 불가** | API 제공사 changelog 공개 없음, 외부에서 관찰 불가 |
| (B) 우연(추론 모델 seed 편차) | **가장 유력** | N=2 (R4 + R5 Run3) 의 통계적 취약성. v2 재연 3회로 확정 필요 |
| (C) **프롬프트 텍스트 변경** | **명확히 기각** | `v2-reasoning-prompt.ts` 2026-04-05 이후 무변경. 하드코딩/Registry 양 경로 동일 소스 참조 |

---

## 6. 후속 조치

1. **Day 8 Step 2 (v3 3회) 및 Step 4 (v2 재연 2회)** 진행. 이 배치 결과로 원인 (B) 여부 확정.
2. v2 재연 3회 평균이 25~28% 근처에 수렴하면 → R4/R5 의 30.8% 는 분포 상위 꼬리로 해석.
3. 30% 근처로 회복하면 → R4/R5 가 실력선, Day 7 25.6% 가 하위 꼬리.
4. 어느 쪽이든 "v2 기준선이 30.8%" 라는 가정은 단일 관측의 편향이었음을 리포트 완성본(62번) 에 명시.

---

## 7. 참조

- `src/ai-adapter/src/prompt/v2-reasoning-prompt.ts` — 실제 v2 프롬프트 텍스트 (무변경 파일)
- `src/ai-adapter/src/prompt/registry/variants/v2.variant.ts` — Registry wrapper
- 5ad02e8 커밋: "feat(ai-adapter): PromptRegistry + v4 provider 통합 (SP3)"
- aff958c 커밋: "feat: USE_V2_PROMPT 토글 — DeepSeek v2 영문 프롬프트를 GPT/Claude에 적용"
- `docs/02-design/42-prompt-variant-standard.md` §4 — resolve 우선순위 5단계
- `docs/04-testing/59-v2-zh-day7-battle-report.md` — Day 7 env 변경 기록
- `docs/04-testing/60-round9-5way-analysis.md` — AI Engineer 5-way 분석 (이 문서가 후속)
