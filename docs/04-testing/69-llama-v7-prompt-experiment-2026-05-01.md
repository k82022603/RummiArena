# LLaMA(Ollama) v2 vs v7 프롬프트 실측 실험 보고서

- **날짜**: 2026-05-01
- **담당**: game-analyst (실측 설계), Claude (실행)
- **모델**: qwen2.5:3b (K8s Ollama Pod)
- **대전 구성**: Human(AutoDraw) vs AI, 80턴 제한, 턴타임아웃 120s

---

## 1. 실험 배경

`docs/02-design/68-llama-prompt-analysis-2026-04-30.md` game-analyst 분석에서,
v7-ollama-meld 프롬프트가 2026-04-22 도입 이후 **KPI 검증이 한 번도 실행되지 않은** 것이 P0-1로 식별됨.

또한, K8s ConfigMap에 `OLLAMA_PROMPT_VARIANT`가 미적용(drift)된 사실이 확인됨.

---

## 2. 실험 설계

| 구분 | 조건 | 게임 수 |
|------|------|---------|
| **Round A** (베이스라인) | v2 fallback (OLLAMA_PROMPT_VARIANT 미설정) | 1 |
| **Round B** (v7) | `OLLAMA_PROMPT_VARIANT=v7-ollama-meld` | 1 |

- WS timeout: 600s (cold-start 대응, 기본값 270s에서 상향)
- 실험 전 qwen2.5:3b 워밍업 실시 (cold-start 359s 문제 회피)

---

## 3. 실측 결과

### Round A — v2 Fallback (베이스라인)

| 지표 | 값 |
|------|-----|
| Place rate | **0.0%** |
| Place 시도 | 0턴 |
| Draw (정상) | 7턴 |
| Fallback (INVALID_MOVE) | **6턴** |
| Fallback 사유 | ERR_GROUP_NUMBER × 6 |
| 총 턴 수 | 17턴 |
| 결말 | **FORFEIT** (AI_FORCE_DRAW_LIMIT) |
| 평균 응답시간 | 69.7s (p50=75.4s) |

**에러 패턴**: 연속 숫자 규칙(V-15) 위반. AI가 런을 구성하려 했으나 번호 연속성이 깨진 그룹(예: 3-7-9)을 제출 → 전량 `ERR_GROUP_NUMBER` → 강제 DRAW → 17턴 만에 AI_FORCE_DRAW_LIMIT → FORFEIT.

### Round B — v7-ollama-meld

| 지표 | 값 |
|------|-----|
| Place rate | **0.0%** |
| Place 시도 | 0턴 |
| Draw (정상) | 39턴 |
| Fallback (INVALID_MOVE) | **0턴** |
| 총 턴 수 | **80턴** (완주) |
| 결말 | TIMEOUT (80턴 소진) |
| 평균 응답시간 | 46.5s (p50=40.0s) |

**에러 패턴**: 없음. AI가 매 턴 안정적으로 DRAW를 선택.

---

## 4. v2 vs v7 비교

| 항목 | v2 (Round A) | v7 (Round B) | 개선 방향 |
|------|-------------|-------------|----------|
| Place rate | 0% | 0% | 동일 |
| INVALID_MOVE | 6회 (ERR_GROUP_NUMBER) | **0회** | ✅ 개선 |
| 게임 생존 | 17턴 FORFEIT | **80턴 완주** | ✅ 개선 |
| 응답 시간 | 69.7s/턴 | **46.5s/턴** | ✅ 33% 단축 |
| 안정성 | 불안정 (rule violation 반복) | 안정 (보수적 draw) | ✅ 개선 |

---

## 5. 해석

### v7 효과 — 긍정

1. **V-15 위반 제거**: v2에서 반복됐던 ERR_GROUP_NUMBER(숫자 연속성 위반)가 v7에서 완전히 사라졌다. v7의 4-STEP 절차와 Pattern 예시가 AI로 하여금 잘못된 런을 만들지 않도록 유도한 것으로 판단.

2. **게임 생존**: v2 → 17턴 FORFEIT(패널티 종료) vs v7 → 80턴 완주. 게임 참여 지속성 측면에서 압도적 개선.

3. **응답 속도**: v7의 명시적 STEP 지시로 AI가 "DRAW 결정"에 더 빨리 도달. 평균 23.2s 단축(33%).

### v7 효과 — 한계

1. **Place rate 0% 유지**: v7이 에러는 없앴지만 실제 타일 배치를 유도하지 못했다. 4-STEP + few-shot이 보수적 fallback("확신이 없으면 DRAW")으로 학습됐을 가능성이 높다.

2. **근본 한계 — 모델 용량**: qwen2.5:3b(3B 파라미터)는 80턴 동안 누적된 핸드 타일(최대 30+장)과 테이블 그룹 상태를 추론하기에 컨텍스트 처리 능력이 부족할 수 있다.

---

## 6. cold-start 발견 사항

최초 실행 시 qwen2.5:3b 추론 소요시간: **359초(6분)**  
워밍업 후: 평균 24~88초/턴

K8s 운영 중 Ollama Pod가 idle 상태이면 매 게임 첫 턴이 6분 이상 소요될 수 있음. 이는 turn_timeout(120s)을 크게 초과하며 게임 서버가 해당 턴을 강제 DRAW 처리한다.

**대응 방안**: Ollama에 정기 warm-up ping 설정 (CronJob 또는 probe) 검토.

---

## 7. 추가 실험 권고

### 즉시 시도 가능 (K8s에 모델 설치됨)

| 모델 | 크기 | 예상 효과 |
|------|------|----------|
| **qwen3:4b** | 2.5GB | qwen2.5:3b 대비 추론 능력 향상, v7 프롬프트 활용 가능성 ↑ |
| **qwen3:1.7b** | 1.4GB | 속도 우선, 품질은 qwen3:4b 대비 낮음 |

```bash
# qwen3:4b 전환 실험
kubectl set env deploy/ai-adapter -n rummikub OLLAMA_DEFAULT_MODEL=qwen3:4b
# 실측 후 원복
kubectl set env deploy/ai-adapter -n rummikub OLLAMA_DEFAULT_MODEL=qwen2.5:3b
```

### v7 프롬프트 개선 포인트 (P1)

현재 v7은 "DRAW when uncertain" 바이어스가 과도함. 다음 개선 방향:

1. **"PLACE 우선" 명시**: Step 3에서 "유효한 세트가 **1개라도** 있으면 반드시 PLACE" 강조
2. **최소 조건 가이드**: "손패 중 같은 색 3연속이 있으면 즉시 PLACE" 형식의 트리거 규칙 추가
3. **negative few-shot 제거**: Pattern E 함정(1장 그룹 제출 패턴) 완전 제거

---

## 8. 결론

| 항목 | 판정 |
|------|------|
| v7 도입 효과 | ✅ **CONDITIONAL GO** — 안정성/생존 개선, place rate 미달성 |
| qwen2.5:3b + v7 생산 운영 적합성 | ⚠️ **HOLD** — 0% place rate는 게임 기여 없음, 베이스라인 역할만 가능 |
| qwen3:4b 전환 시도 | ✅ **권고** — 즉시 실험 가능, 비용 $0 |
| v7 프롬프트 개선 | ✅ **P1 권고** — "PLACE 우선" 바이어스 보정 필요 |
| Ollama cold-start 대응 | ✅ **P1 권고** — warm-up CronJob 설정 |

**v7은 유지. qwen3:4b 교체 실험 및 v7 프롬프트 개선이 다음 우선 과제.**

---

## 부록: 실측 로그 파일

- Round A: `work_logs/battles/llama-v7-eval/round-a-v2-20260501-052440.log`
- Round B: `work_logs/battles/llama-v7-eval/round-b-v7-20260501-053441.log`

## 부록: K8s 조작 이력

```bash
# Round B 실험을 위한 v7 활성화
kubectl set env deploy/ai-adapter -n rummikub OLLAMA_PROMPT_VARIANT=v7-ollama-meld
# 실험 완료 후 v7 유지 (Helm values.yaml 기준과 일치)
```
