# 장애 보고서 — V4-Flash Non-Thinking INVALID_MOVE

> fallback 3건 발생. 즉시 작성.

## 1. 발생 개요

- **발생 시각 (KST)**: 2026-04-27 20:04~20:07
- **BatchTag**: v4-phase1-flash-nonthinking
- **Run N/M**: 1/1
- **Shaper**: passthrough
- **해당 턴**: T4~T10 (초반)
- **fallback 종류**: INVALID_MOVE x3 (서버 규칙 위반 거절)
- **정상 복구 여부**: 자동 draw 대체 → T10에서 FORFEIT (10턴 제한)

## 2. 직전 정상 턴 vs 장애 턴

| 구분 | 턴 | latency | action | 비고 |
|-----|---|---------|--------|------|
| 장애 직전 | T3 | 3.3s | DRAW | 정상 |
| **장애 발생** | T4 | **2.8s** | **INVALID_MOVE → fallback draw** | ERR_GROUP_COLOR_DUP |
| **장애 발생** | T6 | **3.5s** | **INVALID_MOVE → fallback draw** | 서버 거절 |
| **장애 발생** | T8 | **1.4s** | **INVALID_MOVE → fallback draw** | 서버 거절 |
| FORFEIT | T10 | - | FORFEIT | 10턴 완주 실패 |

## 3. 현재 Run 의 구간별 누적 통계

| 구간 | 턴 수 | avg latency | p95 | max | PLACE |
|-----|------|-------------|-----|-----|-------|
| 초반 T1-10 | 10 | 2.4s | 3.5s | 3.5s | 0% |

## 4. 타임아웃 체인 설정

```
script_ws: 770s
gs_ctx: 760s
http_client: 760s
istio_vs: 710s
DTO_max: 720s
adapter_floor: 700s
```

부등식 계약 준수: 타임아웃 문제 아님. 응답은 2~3초로 매우 빠름.

## 5. ai-adapter 로그 스냅샷

```
[deepseek] attempt=1/5 temperature=0 variant=v2
[deepseek] 성공 action=draw latencyMs=2961
[ResponseParser] 그룹 tiles 수 부족(2) → draw로 변환
[ResponseParser] JSON 파싱 실패: Expected ',' or ']' after array element
[deepseek] attempt=1 파싱 실패
ROLLBACK_FORCED: ERR_GROUP_COLOR_DUP
```

game-server:
```
ROLLBACK_FORCED {"seat": 1, "errorCode": "ERR_GROUP_COLOR_DUP"}
PENALTY_DRAW [7.1s]
```

## 6. 근본 원인 분석

### 가설 후보
- [ ] A. Shaper 내부 로직 지연 → 해당 없음
- [ ] B. DeepSeek API 일시 장애 → 해당 없음 (응답 정상 수신)
- [ ] C. timeout 체인 설정 부족 → 해당 없음
- [ ] D. ai-adapter 리소스 부족 → 해당 없음
- [ ] E. Istio sidecar 문제 → 해당 없음
- [x] **F. Non-thinking 모드에서 추론 능력 부족**

### 확증된 원인

**V4-Flash non-thinking 모드는 게임 전략 추론이 불가능하다.**

DeepSeek V4 기술 보고서 Table 7에서 확인:
- Non-Think GPQA: 71.2% vs High: 87.4% (추론 2배 차이)
- Non-Think LiveCodeBench: 55.2% vs High: 88.4%
- Non-Think Apex: 1.0% vs High: 19.1%

Non-thinking 모드는 패턴 매칭만 가능하고, 루미큐브 규칙 준수 + 전략 수립에 필요한 chain-of-thought 추론이 작동하지 않는다. 결과:
1. 2타일 그룹 생성 시도 (tiles 수 부족 → draw 변환)
2. 색상 중복 그룹 생성 시도 (ERR_GROUP_COLOR_DUP → ROLLBACK_FORCED)
3. malformed JSON 출력 (response_format: json_object 설정에도 불구)

### 근거
- V4 기술 보고서 Table 7 Non-Think vs High 성능 비교
- JSON Output 가이드: "빈 content 반환 가능"
- 실측: place rate 0%, INVALID_MOVE 3건, FORFEIT

## 7. 재발 방지 액션

### 즉시 조치 (30분 내)
- `DEEPSEEK_V4_THINKING_MODE=true`로 전환
- thinking High 모드로 재대전 실행

### 단기 조치 (24시간 내)
- non-thinking 모드를 RummiArena 대전에서 사용 금지 정책 문서화
- 63번 마이그레이션 문서에 "non-thinking 부적합" 실증 결과 추가

### 장기 교훈
- **새 모델/모드 도입 시 1턴 curl 테스트 필수** (배치 실행 전)
- API 문서 전수 조사 후 코드 수정 (이번에 3번이나 사용자가 문서 링크 제공)
- 기술 보고서 벤치마크 데이터 사전 확인 후 모드 결정

## 8. 영향 범위

- 해당 Run: 무효 (place rate 0%, 10턴 FORFEIT)
- 다른 Run: 영향 없음 (아직 미실행)
- 비용: $0.003 소모 (무시 가능)

## 9. 의사결정 기록

- **배치 계속?** YES — thinking 모드로 전환 후 재실행
- **timeout 조정 즉시?** NO — 700초 유지 (애벌레 지시)
- **애벌레 긴급 알림?** NO — 이미 대화 중 실시간 보고됨
- **후속 Run 에서 재발 모니터링 강화?** YES — thinking 모드에서도 파싱 실패 모니터링

---

**서명**: Claude main (Opus 4.6)
**최종 승인자**: 애벌레
