# 장애 보고서 — 타임아웃 (Timeout Incident)

> 이 템플릿은 **AI 대전 중 fallback (timeout) 이 1건이라도 발생하면 즉시 작성**한다.
> 파일명: `work_logs/incidents/YYYY-MM-DD-NN-timeout.md` (NN은 같은 날짜 내 순번)
> 작성자: Claude main (자율 감지) 또는 DevOps/QA 에이전트

## 1. 발생 개요

- **발생 시각 (KST)**:
- **BatchTag**:
- **Run N/M**:
- **Shaper**:
- **해당 턴**: T__ (구간: 초반 T1-25 / 중반 T26-55 / 후반 T56-80)
- **fallback 종류**: AI_TIMEOUT @ ___s / WS_CLOSED / HTTP_DISCONNECT / 기타
- **정상 복구 여부**: 자동 draw 대체됨 / 게임 중단 / 기타

## 2. 직전 정상 턴 vs 장애 턴

| 구분 | 턴 | latency | action | 비고 |
|-----|---|---------|--------|------|
| 장애 직전 | T__ | ___s | PLACE/DRAW | — |
| **장애 발생** | T__ | **___s timeout** | fallback | — |
| 장애 후 복구 | T__ | ___s | PLACE/DRAW | — |

## 3. 현재 Run 의 구간별 누적 통계 (장애 발생 시점까지)

| 구간 | 턴 수 | avg latency | p95 | max | PLACE |
|-----|------|-------------|-----|-----|-------|
| 초반 T1-25 | | | | | |
| 중반 T26-55 | | | | | |
| 후반 T56-80 | | | | | |

## 4. 타임아웃 체인 설정 (발생 시점)

현재 적용 값 (`AI_ADAPTER_TIMEOUT_SEC`, Istio VS, ws_timeout 등):
```
script_ws: ___s
gs_ctx: ___s
http_client: ___s
istio_vs: ___s
DTO_max: ___s
adapter_floor: ___s
```

부등식 계약 (KDP #7) 준수 여부:

## 5. ai-adapter / game-server 로그 스냅샷

### ai-adapter (장애 턴 전후 60초)
```
kubectl logs -n rummikub deploy/ai-adapter --since=2m | tail -50
```

### game-server (fallback 트리거 지점)
```
kubectl logs -n rummikub deploy/game-server --since=2m | grep -iE "fallback|timeout|AI_TIMEOUT"
```

## 6. 근본 원인 분석

### 가설 후보
- [ ] A. Shaper 내부 로직 지연 (ADR 44 §8 50ms 예산 초과?)
- [ ] B. DeepSeek API 일시 장애 (vendor timeout)
- [ ] C. timeout 체인 설정 부족 (700s 한도 근접)
- [ ] D. ai-adapter 리소스 부족 (CPU throttle, OOM)
- [ ] E. Istio sidecar 문제 (circuit breaker?)
- [ ] F. 기타

### 확증된 원인

### 근거

## 7. 재발 방지 액션

### 즉시 조치 (30분 내)

### 단기 조치 (24시간 내)
- timeout 체인 조정 필요 여부
- shaper 로직 검증 필요 여부

### 장기 교훈 (SKILL/ADR 반영)

## 8. 영향 범위

- 해당 Run 통계 유효성 (fallback 1건 포함 계산 가능 / 재실측 필요)
- 다른 Run 에 영향 (shaper env 의 흔적 등)
- 본실측 (Task #19) turn 80 × 3N 에의 영향

## 9. 의사결정 기록

- **배치 계속?** YES/NO
- **timeout 조정 즉시?** YES/NO
- **애벌레 긴급 알림?** YES/NO (야간이면 아침 보고)
- **후속 Run 에서 재발 모니터링 강화?** YES/NO

---

**서명 (보고서 작성자)**: Claude main / 에이전트명
**최종 승인자**: 애벌레
