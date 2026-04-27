# 장애 보고서 — V4-Pro Thinking AI_TIMEOUT

## 1. 발생 개요

- **발생 시각 (KST)**: 2026-04-27 ~22:20 (T36)
- **BatchTag**: v4-phase1-pro-thinking
- **Run N/M**: 1/1
- **Shaper**: passthrough
- **해당 턴**: T36 (중반 T26-55)
- **fallback 종류**: AI_TIMEOUT @ 709.3s
- **정상 복구 여부**: 자동 draw 대체됨. T38에서 정상 PLACE 복구.

## 2. 직전 정상 턴 vs 장애 턴

| 구분 | 턴 | latency | action | 비고 |
|-----|---|---------|--------|------|
| 장애 직전 | T34 | 352.4s | DRAW | 정상 |
| **장애 발생** | **T36** | **709.3s timeout** | **fallback draw** | AI_TIMEOUT |
| 장애 후 복구 | T38 | 210.6s | PLACE (5 tiles) | 정상 복구 |
| 복구 후 | T40 | 231.0s | PLACE (1 tile) | 연속 place |

## 3. 구간별 누적 통계

| 구간 | 턴 수 | avg latency | max | PLACE |
|-----|------|-------------|-----|-------|
| 초반 T1-25 | 12 | 335s | 652s | 3회 |
| 중반 T26-44 | 9 | 398s | 709s | 3회 |

## 4. 타임아웃 체인 설정

```
script_ws: 770s
gs_ctx: 760s
http_client: 760s
istio_vs: 710s
DTO_max: 720s
adapter_floor: 700s ← 709s에 초과
```

부등식 계약: adapter_floor(700s) 초과로 AI_TIMEOUT 발생. 9.3초 초과.

## 5. 근본 원인 분석

### 확증된 원인

V4-Pro thinking 모드에서 보드 복잡도 증가 시 reasoning 토큰이 급증하여 700초 타임아웃을 초과. T22(652s), T28(657s)로 이미 근접했으며 T36(709s)에서 최초 초과.

R1 대비 V4-Pro thinking의 평균 레이턴시가 2.8배 (R1 131s vs V4-Pro 372s). R1에서는 후반 200초가 최대였으나 V4-Pro는 중반에 이미 700초대.

### 근거

- V4-Pro는 1.6T 파라미터 모델로 R1보다 reasoning이 깊고 길다
- thinking 모드의 output 토큰이 8143~16073으로 R1 대비 크다

## 6. 재발 방지 액션

### 즉시 조치
- 현재 게임은 계속 진행 (단발성 timeout, 직후 복구됨)

### 단기 조치
- V4-Pro를 운영에 도입하려면 타임아웃 상향 필요 (최소 800초)
- 또는 reasoning_effort를 "max" 대신 "high"로 유지 (이미 high)

### 장기 교훈
- V4-Pro thinking의 레이턴시 분포가 R1과 근본적으로 다름
- 타임아웃 체인 조정 없이 V4-Pro 전환은 fallback 리스크

## 6b. 2차 timeout (T46)

- **턴**: T46, 709.2초
- **패턴**: T36과 동일 (10턴 간격, 비연속)
- **복구**: T48 thinking 중 (아직 미완)
- **누적 fallback**: 2건 / 연속 아님 → 게임 계속

## 7. 의사결정 기록

- **배치 계속?** YES — 단발성, 직후 복구
- **timeout 조정 즉시?** NO — 700초 유지 (애벌레 지시)
- **애벌레 긴급 알림?** NO — 실시간 모니터링 중
- **후속 모니터링 강화?** YES — 후반 턴에서 추가 timeout 발생 예상

---

**서명**: Claude main (Opus 4.6)
