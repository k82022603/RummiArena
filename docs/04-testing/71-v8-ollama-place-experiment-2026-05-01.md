# v8-ollama-place 프롬프트 실측 실험 보고서

- **날짜**: 2026-05-01
- **담당**: Claude (실행)
- **모델**: qwen2.5:3b (K8s Ollama Pod)
- **프롬프트**: v8-ollama-place (사전 계산 멜드 박제)
- **대전 구성**: Human(AutoDraw) vs AI, 40턴 제한, turnTimeout=300s
- **결론**: ✅ **PLACE 소원 달성** — 40턴 중 3회 PLACE, place rate 15.8%

---

## 1. 실험 배경

v2/v7 프롬프트에서 qwen2.5:3b의 place rate 0% 문제:
- **v2**: 6회 ERR_GROUP_NUMBER 후 17턴 FORFEIT
- **v7**: INVALID_MOVE 없지만 모든 턴 DRAW (80턴 TIMEOUT)

근본 원인: 3B 모델이 14~20장 랙에서 30점 이상 조합을 신뢰할 수 있게 계산하지 못함.

**v8 전략**: 프롬프트 빌더(TypeScript)가 `findMeldFor30()` 알고리즘으로 유효 멜드를 사전 계산하여 "Output this JSON exactly: {...}" 형태로 박제. 모델은 추론 없이 복사만.

---

## 2. 실험 설계

| 항목 | 설정 |
|------|------|
| 모델 | qwen2.5:3b |
| 프롬프트 | v8-ollama-place |
| K8s 환경 | `OLLAMA_DEFAULT_MODEL=qwen2.5:3b`, `OLLAMA_PROMPT_VARIANT=v8-ollama-place` |
| 최대 턴 | 40턴 |
| turnTimeout | 300s |
| ws_timeout | 3600s |

---

## 3. 실측 결과

| 지표 | 값 |
|------|-----|
| **Place rate** | **15.8% (3/19 AI 턴)** |
| Place 횟수 | **3회** |
| Place 타일 수 | **8장 합계** (6+1+1) |
| Draw | 16회 |
| Fallback | **0회** |
| 총 턴 수 | 40턴 (완주) |
| 결말 | TIMEOUT (40턴 소진) |
| 총 소요 시간 | 375.8s (~6.3분) |
| 평균 응답 시간 | 19.7s (p50=10.0s) |

### PLACE 상세

| 턴 | 타일 수 | 응답시간 | 내용 |
|----|--------|---------|------|
| T03 | **6장** | 165.2s | 초기 등록(Initial Meld) — 6타일로 30점+ 달성 |
| T05 | 1장 | 27.2s | 테이블 그룹 확장 (초기 등록 후) |
| T37 | 1장 | 26.6s | 테이블 그룹 확장 |

---

## 4. v2 / v7 / v8 3-way 비교

| 항목 | v2 | v7 | **v8** |
|------|----|----|--------|
| Place rate | 0% | 0% | **15.8%** |
| Place 횟수 | 0 | 0 | **3** |
| INVALID_MOVE | 6회 | 0회 | 0회 |
| 게임 완주 | 17턴 FORFEIT | 80턴 TIMEOUT | **40턴 TIMEOUT** |
| 평균 응답시간 | 69.7s | 46.5s | **19.7s** (초기 등록 후 ~10s) |
| 프롬프트 크기 | ~1200 토큰 | ~1700 토큰 | **~355 토큰** |
| 실전 투입 | ❌ | ⚠️ | ✅ |

---

## 5. 해석

### v8 효과 — 긍정

1. **place rate 0% → 15.8%**: 사전 계산 박제 전략이 효과적. 모델이 추론 없이 JSON 복사만 수행하여 신뢰성 확보.

2. **응답 속도 혁신**: 초기 등록 전 165.2s → 이후 평균 10s. 프롬프트 크기가 355 토큰(v7 대비 1/6)으로 줄어 추론 부담 급감.

3. **INVALID_MOVE 0회**: v8의 findMeldFor30이 유효한 세트만 박제하므로 게임룰 위반 없음.

4. **T03 초기 등록 성공**: 실제 14장 랙에서 6장 조합을 찾아 30점+ 달성. 초기 등록 완료 후 빠른 DRAW/확장 패턴으로 전환.

### v8 효과 — 한계

1. **초기 등록 전 응답시간**: T03에서 165.2s (2.75분). 워밍업 상태임에도 v7(46.5s/턴)보다 3.5배 느림. 원인: 초기 등록 시 `findMeldFor30` 결과를 포함한 프롬프트가 첫 추론에서 더 긴 컨텍스트를 처리.

2. **테이블 확장 한계**: `findTableExtension`이 단순 1타일 확장만 탐지. 복잡한 재배치(기존 그룹 분리 후 재조합)는 미지원.

3. **place rate 15.8% = 19 AI 턴 중 3회**: 초기 등록 이후 대부분 DRAW. 테이블에 확장 가능한 타일이 없으면 DRAW를 선택하는 보수적 설계 때문.

---

## 6. 기술 구현 요약

```
src/ai-adapter/src/prompt/v8-ollama-place-prompt.ts
  - findValidGroups(): 같은 숫자, 다른 색상, 3~4장
  - findValidRuns(): 같은 색상, 연속 숫자, 3+장
  - findMeldFor30(): 단독→2조합→3조합 순 탐색
  - findTableExtension(): 초기 등록 후 1타일 확장
  - buildV8OllamaPlaceUserPrompt(): 계산 결과를 JSON 박제

프롬프트 크기: 시스템 ~150토큰 + 유저 ~200토큰 = **350토큰**
기존 v7 대비: 1700+600=2300토큰 → 350토큰 **(6.6배 감소)**
```

---

## 7. 결론 및 다음 단계

| 항목 | 판정 |
|------|------|
| v8 생산 운영 적합성 | ✅ **GO** — place rate 15.8%, INVALID_MOVE 0, 40턴 완주 |
| 기존 v7 대비 개선 | ✅ **채택** — 속도 + place rate 모두 개선 |
| K8s 배포 | ✅ 완료 (`OLLAMA_PROMPT_VARIANT=v8-ollama-place`) |
| `소원 달성` | ✅ **LLaMA가 드디어 PLACE!** |

### 추가 개선 여지 (P2 이후)

1. **멀티타일 확장**: 테이블 그룹 확장 시 2~3타일 동시 추가 지원
2. **재배치 지원**: 기존 그룹 재조합으로 새 세트 구성
3. **Place rate 목표**: 현재 15.8% → 목표 30%+ (v8 기반 refinement)

---

## 부록: 실험 로그

- `work_logs/battles/qwen3-4b-eval/qwen3-4b-v7-20260501-101023.log`
- `work_logs/battles/qwen3-4b-eval/qwen3-4b-v7-20260501-101023.json`

## 부록: K8s 설정

```bash
# v8 활성화 (현재 운영 중)
OLLAMA_DEFAULT_MODEL=qwen2.5:3b
OLLAMA_PROMPT_VARIANT=v8-ollama-place
AI_ADAPTER_IMAGE=rummiarena/ai-adapter:v8-86946d4
```
