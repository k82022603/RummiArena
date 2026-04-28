# 장애 보고서 — DeepSeek 모델 설정 회귀 (V4-Pro → V4-Flash)

> Helm drift 정리 과정에서 모델명 변경 누락. 전 턴 강제 드로우 발생.

## 1. 발생 개요

- **발생 시각 (KST)**: 2026-04-28 14:04 ~ 16:17 (약 2시간 13분)
- **발견 시각**: 2026-04-28 16:11 (사용자 스크린샷 보고)
- **복구 시각**: 2026-04-28 16:25 (`kubectl set env` + Helm values 수정)
- **영향 범위**: 해당 시간대 모든 DeepSeek AI 대전
- **심각도**: Medium (AI 1명 기능 상실, 게임 자체는 계속 진행)

## 2. 증상

- DeepSeek(wall) 플레이어가 **모든 턴에서 "강제 드로우 (유효하지 않은 조건 만족)"** 표시
- ai-adapter 로그에서는 `action=place` 성공 응답이 반환되나, game-server가 INVALID_MOVE로 거절
- 사용자 Turn #19, #23, #27 등 DeepSeek 턴마다 동일 증상 반복

## 3. 근본 원인

### 3.1 직접 원인

Helm `values.yaml`의 `DEEPSEEK_DEFAULT_MODEL`이 `deepseek-v4-flash`로 유지된 상태에서, `DEEPSEEK_V4_THINKING_MODE=true`가 적용됨. **V4-Flash + thinking = 규칙 위반 다발** 조합이 배포됨.

### 3.2 왜 발생했는가 (타임라인)

| 시점 | 이벤트 | 상태 |
|------|--------|------|
| 04-27 저녁 | V4-Pro thinking 채택 결정 | `kubectl set env`로 `DEEPSEEK_DEFAULT_MODEL=deepseek-v4-pro` 주입 |
| 04-27 야간 | V4-Pro 3게임 본 대전 완주 (31.9% place) | Override로 정상 동작 |
| 04-28 오전 | 스크럼 — architect가 Helm drift 7건 식별 | 모델명 포함 7건 보고 |
| **04-28 14:00** | **Helm drift 정리 실행** | `kubectl set env ... DEEPSEEK_DEFAULT_MODEL-` 로 override 제거. **그러나 `values.yaml`에 `deepseek-v4-pro` 반영을 누락** |
| 04-28 14:00 | ai-adapter 재배포 | ConfigMap 기본값 `deepseek-v4-flash` + `DEEPSEEK_V4_THINKING_MODE=true` 조합으로 기동 |
| 04-28 16:11 | 사용자 4인 대전 중 이상 발견, 스크린샷 보고 | |
| 04-28 16:25 | `kubectl set env` + `values.yaml` 수정으로 복구 | |

### 3.3 왜 감지하지 못했는가

1. Helm drift 정리 시 **변경 전/후 값 비교 체크리스트가 없었음** — 7건을 일괄 제거하면서 누락 발생
2. 배포 후 **DeepSeek smoke test를 실행하지 않았음** — 다른 작업(ActionBar 연결)에 우선순위를 둠
3. ai-adapter 로그에서는 `action=place 성공`으로 표시되어, adapter 레벨에서는 정상으로 보임

## 4. 영향도

| 항목 | 내용 |
|------|------|
| 사용자 게임 | 4인 대전 1건 — DeepSeek 1명 무력화 (전 턴 강제 드로우) |
| 데이터 손실 | 없음 |
| 비용 | V4-Flash thinking API 호출 ~$0.01 (무의미한 비용) |
| AI 대전 결과 | 해당 게임의 DeepSeek 성적은 무효 (모델 오설정) |

## 5. 복구 조치

1. `kubectl -n rummikub set env deployment/ai-adapter DEEPSEEK_DEFAULT_MODEL=deepseek-v4-pro` (즉시)
2. `helm/charts/ai-adapter/values.yaml` → `DEEPSEEK_DEFAULT_MODEL: "deepseek-v4-pro"` 수정
3. ai-adapter Pod 롤아웃 확인

## 6. 재발 방지

### 6.1 즉시 적용

- [x] Helm values.yaml에 `DEEPSEEK_DEFAULT_MODEL: "deepseek-v4-pro"` 반영 완료
- [x] `kubectl set env` override 재설정으로 런타임 복구

### 6.2 프로세스 개선 (제안)

| 항목 | 내용 |
|------|------|
| **Drift 정리 체크리스트** | `kubectl set env` override 제거 전, 제거 대상 키/값을 values.yaml과 1:1 대조하는 표를 만들고 사용자 확인 후 진행 |
| **배포 후 smoke test** | 모델 설정 변경이 포함된 배포 시, 해당 모델의 1턴 smoke test 필수 |
| **ConfigMap diff 출력** | `helm template` 렌더링 결과와 `kubectl get cm` 실 값을 diff로 비교하는 스크립트 |

## 7. 교훈

> **"Override를 제거하는 것과, 제거한 값을 정식 반영하는 것은 별개 작업이다."**
>
> 7건의 override를 일괄 제거하면서 thinking mode, prompt variant는 반영했지만 모델명을 빠뜨렸다.
> architect 에이전트가 drift 7건을 정확히 보고했음에도, 실행 단계에서 1건이 누락됐다.
> 분석 → 실행 사이에 체크리스트 대조 단계가 없었던 것이 근본 원인이다.

---

**작성자**: Claude Opus 4.6 (메인 세션)
**검토자**: 애벌레 (Owner)
