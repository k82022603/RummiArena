# 결정 로그 (Decision Record)

- **ID**: D-02
- **날짜**: 2026-04-06
- **상태**: 결정

## 제목

v2 영문 Reasoning 프롬프트를 3모델 공통 표준으로 채택

## 배경 (Context)

DeepSeek Reasoner 전용으로 설계한 v2 영문 프롬프트가 Place Rate를 5%→30.8%(A+)로 끌어올렸다. 이 프롬프트의 핵심 요소(영문 전용, 자기 검증, 부정 예시, step-by-step)가 다른 추론 모델에도 효과가 있는지 크로스 모델 실험을 수행했다.

### 실험 결과

| 모델 | 이전 (개별 프롬프트) | v2 (통일 프롬프트) | 변화 |
|------|-------------------|------------------|------|
| **Claude Sonnet 4** | 20.0% (32턴) | **33.3%** (62턴) | **+13.3%p (역대 최고)** |
| **GPT-5-mini** | 28% (R2, 80턴) | **30.8%** (80턴) | +2.8%p + 첫 안정 완주 |
| **DeepSeek Reasoner** | 30.8% (80턴) | 17.9% (80턴) | -12.9%p (게임 분산) |

## 선택지

| 옵션 | 장점 | 단점 |
|------|------|------|
| A. 모델별 개별 프롬프트 유지 | 모델 특성에 맞춤 최적화 가능 | 3배 유지보수, 개선 실험 비용 3배 |
| B. v2 영문 프롬프트 3모델 공통 | 유지보수 단순, 개선 효과 전 모델 동시 적용 | DeepSeek 분산 미해소, Ollama 미적용 |
| C. 모델별 v2 변형 (v2-gpt, v2-claude, v2-deepseek) | 공통 기반 + 모델별 미세 튜닝 | 복잡성 증가, 실험 비용 |

## 결정

**옵션 B 채택** — v2 영문 reasoning 프롬프트를 GPT-5-mini, Claude Sonnet 4, DeepSeek Reasoner 3모델 공통 표준으로 사용한다.

단, Ollama(qwen2.5:3b)는 소형 모델로 reasoning 능력이 제한적이므로 기존 공통 프롬프트를 유지한다.

## 근거

1. **Claude +13.3%p**: v2의 자기 검증 단계가 extended thinking과 시너지. 한국어→영문 전환으로 토큰 60% 절감, thinking 예산이 실제 추론에 집중됨
2. **GPT 첫 안정 완주**: v2의 step-by-step 구조가 추론 모델의 chain-of-thought를 안정화. 이전에는 14턴에서 WS 끊김이 발생했으나 80턴 완주 달성
3. **유지보수 단순화**: 프롬프트 개선 시 1회 수정으로 3모델 동시 적용. `v2-reasoning-prompt.ts` 단일 파일 관리
4. **DeepSeek 분산은 프롬프트 문제가 아님**: 동일 프롬프트로 30.8%↔17.9% 변동은 게임 내 타일 배분 랜덤성에 기인. 다회 실행 평균으로 수렴 예상
5. **비용 효율**: GPT $0.975/game, Claude $2.22/game, DeepSeek $0.039/game으로 실험 가능한 수준

## 구현

- 공유 모듈: `src/ai-adapter/src/prompt/v2-reasoning-prompt.ts`
- 환경 변수: `USE_V2_PROMPT=true` (K8s ConfigMap 반영 완료)
- 각 어댑터: `generateMove()` 오버라이드, v2 모드일 때 공유 프롬프트 사용
- 테스트: 395/395 PASS, 기존 동작 깨지지 않음

## 영향 범위

- `src/ai-adapter/src/adapter/openai.adapter.ts` — v2 토글 추가
- `src/ai-adapter/src/adapter/claude.adapter.ts` — v2 토글 추가
- `src/ai-adapter/src/adapter/deepseek.adapter.ts` — 공유 모듈 import
- `helm/charts/ai-adapter/values.yaml` — USE_V2_PROMPT 키 추가 대상
- `docs/02-design/18-model-prompt-policy.md` — 프롬프트 아키텍처 갱신
- `docs/04-testing/38-v2-prompt-crossmodel-experiment.md` — 실험 상세 보고서

## 후속 과제

- [ ] v3 프롬프트 개선안 4건 적용 후 재실험 (Round 5)
- [ ] 다회 실행(5~10회) 평균으로 통계적 유의성 확보
- [ ] Ollama에 v2 경량화 버전 적용 가능성 검토
- [ ] Helm values.yaml에 USE_V2_PROMPT 영구 반영
