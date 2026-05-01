# qwen3:4b 전환 실험 보고서

- **날짜**: 2026-05-01
- **담당**: Claude (실행)
- **모델**: qwen3:4b (K8s Ollama Pod)
- **대전 구성**: Human(AutoDraw) vs AI, 20턴 제한, turnTimeout=300s, ws_timeout=3600s
- **결론**: **REJECT** — CPU 환경에서 실전 투입 불가

---

## 1. 실험 배경

`docs/04-testing/69-llama-v7-prompt-experiment-2026-05-01.md` 결과에서,
qwen2.5:3b + v7은 place rate 0%를 기록했고, 모델 용량 한계로 qwen3:4b 전환이 권고됨.

K8s Ollama Pod에 qwen3:4b(2.5GB)가 이미 로드되어 있어 즉시 실험 가능한 상태였음.

---

## 2. 실험 설계

| 항목 | 설정 |
|------|------|
| K8s 환경 | `OLLAMA_DEFAULT_MODEL=qwen3:4b`, `OLLAMA_PROMPT_VARIANT=v7-ollama-meld` |
| 배틀 스크립트 | `ws_timeout=3600s`, `turnTimeoutSec=300s` |
| 최대 턴 | 20턴 |
| 워밍업 | 실험 전 워밍업 완료 (응답 소요: 47s) |

---

## 3. 실측 결과 (조기 중단)

### 실험 타임라인

| 시각 (KST) | 이벤트 |
|-----------|-------|
| 06:14:16 | 게임 시작, T01~T02 Human DRAW |
| 06:14:16 | T03 AI 추론 시작 |
| 06:31:07 | T03 AI_TIMEOUT (1011.1s) — DRAW-FALLBACK |
| 06:31:08 | T04 Human DRAW, T05 AI 추론 시작 |
| 06:33:22 | 실험 강제 중단 (완주 예측: 2.8시간) |

### 핵심 지표 (T03 단독 관측)

| 지표 | 값 |
|------|-----|
| AI 추론 소요 (T03) | **1011.1s** (ai-adapter 타임아웃) |
| 실제 Ollama 응답 | 타임아웃 전 미완 (추론 중 종료) |
| Place rate | **0.0%** (0회) |
| Fallback 사유 | AI_TIMEOUT |
| 완주 예측 (20턴) | ~2.8시간 |

---

## 4. 보조 실험: think=false 속도 테스트

qwen3:4b를 thinking 모드 비활성화(`think: false`)로 직접 호출:

```bash
curl http://localhost:11434/api/chat -d '{
  "model":"qwen3:4b",
  "think": false,
  "messages":[{"role":"user","content":"/no_think ...간단한 루미큐브 질문..."}],
  "options":{"num_predict":100}
}'
```

| 항목 | 값 |
|------|-----|
| 소요 시간 | **276s** (단순 30토큰 프롬프트) |
| 생성 토큰 수 | 45 tokens |
| 추론 속도 | **0.16 tokens/s** |

v7 실전 프롬프트(시스템 1700 + 게임상태 800 ≈ 2500 토큰 입력)로 추정 시:
- 응답 토큰 200개 기준: **1250s/턴** — 여전히 타임아웃 초과

---

## 5. 원인 분석

### qwen3 Thinking 모드 기본 활성화

qwen3 시리즈는 추론(Thinking) 모드가 **기본 활성화**된다.
- `/think` 토큰: 명시적 thinking 활성화
- `/no_think` 토큰: thinking 비활성화
- `think: false` API 파라미터: thinking 비활성화 (Ollama 0.7+)

v7 프롬프트는 `/no_think` 비활성화 지시 없이, 4-STEP 절차로 구성되어 있어
qwen3:4b가 각 STEP을 심층 추론함 → **thinking 토큰 급증**.

### LG Gram CPU 하드웨어 한계

| 항목 | 값 |
|------|-----|
| CPU | Intel i7-1360P |
| 추론 방식 | CPU-only (GPU 없음) |
| qwen3:4b 토큰 속도 | ~0.16 tokens/s (no-think 기준) |
| qwen2.5:3b 토큰 속도 | ~2 tokens/s (추정, 46.5s/turn 기준) |

qwen3:4b는 qwen2.5:3b 대비 파라미터 증가 + thinking 모드로 **12.5배 이상** 느림.

---

## 6. v2 vs v7 vs qwen3:4b 3-way 비교

| 항목 | qwen2.5:3b v2 | qwen2.5:3b v7 | qwen3:4b v7 |
|------|--------------|--------------|------------|
| Place rate | 0% | 0% | 0% |
| 평균 응답시간 | 69.7s | 46.5s | **1011s** (타임아웃) |
| INVALID_MOVE | 6회 | 0회 | 0회 (관측 불가) |
| 게임 결말 | 17턴 FORFEIT | 80턴 TIMEOUT | 조기 중단 |
| 실전 투입 가능 | ⚠️ HOLD | ⚠️ HOLD | ❌ REJECT |

---

## 7. 결론 및 권고

| 항목 | 판정 |
|------|------|
| qwen3:4b 실전 투입 | ❌ **REJECT** — 1000s+/턴, 실전 불가 |
| qwen3:4b 개선 가능성 | ⚠️ **CONDITIONAL** — think=false + 하드웨어 업그레이드 시 |
| qwen2.5:3b 유지 | ✅ **권고** — 현 하드웨어에서 유일한 실용적 선택지 |
| v7 프롬프트 개선 | ✅ **P1 유지** — "PLACE 우선" 바이어스 보정 |
| Ollama warm-up CronJob | ✅ **P1 유지** — cold-start 대응 |

### qwen3:4b 재시도 조건 (미래)

1. **GPU 가용 환경**: K8s에 GPU 노드 추가 시 재평가 (예: NVIDIA RTX 3060 12GB)
2. **think=false 적용**: OllamaAdapter에 qwen3 계열 자동 감지 후 `think: false` 주입
3. **qwen3:1.7b 시도**: 1.4GB 소형 모델, thinking 비활성화 시 속도 개선 가능

### 즉시 원복

```bash
kubectl set env deploy/ai-adapter -n rummikub OLLAMA_DEFAULT_MODEL=qwen2.5:3b
# OLLAMA_PROMPT_VARIANT=v7-ollama-meld 유지
```

---

## 부록: 실험 로그

- `work_logs/battles/qwen3-4b-eval/qwen3-4b-v7-20260501-061416-ABORTED.log`

## 부록: K8s 조작 이력

```bash
# qwen3:4b 전환
kubectl set env deploy/ai-adapter -n rummikub OLLAMA_DEFAULT_MODEL=qwen3:4b
# 실험 중단 후 qwen2.5:3b 원복
kubectl set env deploy/ai-adapter -n rummikub OLLAMA_DEFAULT_MODEL=qwen2.5:3b
```
