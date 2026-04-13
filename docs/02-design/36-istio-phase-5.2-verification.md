# 36. Istio Phase 5.2 트래픽 정책 검증 (초안)

- 작성일: 2026-04-13 (Sprint 6 Day 2)
- 작성자: devops-1 (Agent Teams)
- 상태: 초안(Draft) — 현재 상태 확인 체크리스트 중심, 실증 테스트는 Day 3 예정
- 연관: `docs/02-design/20-istio-selective-mesh-design.md`, `docs/02-design/27-istio-sprint6-precheck.md`

## 1. 검증 목표

Sprint 6 Day 1에 적용된 Istio 트래픽 정책 리소스 4건(DestinationRule 1, VirtualService 1, PeerAuthentication 2)이 rummikub 네임스페이스에 정상 존재하는지 확인하고, Phase 5.2 실증 테스트(서킷 브레이커 / 재시도 중첩 / 타임아웃 정합 / Place Rate 회귀)의 선결 조건을 점검한다.

## 2. 현재 상태 체크리스트

### 2.1 CRD 존재 확인

| 리소스 | 이름 | 상태 | 비고 |
|---|---|---|---|
| DestinationRule | ai-adapter | ✓ 존재 (3h9m) | host: ai-adapter.rummikub.svc.cluster.local |
| VirtualService | ai-adapter | ✓ 존재 (3h9m) | hosts: ai-adapter |
| PeerAuthentication | ai-adapter-strict | ✓ 존재 (3h9m) | mode: STRICT |
| PeerAuthentication | default | ✓ 존재 (3h9m) | mode: PERMISSIVE |

`kubectl get dr,vs,pa -n rummikub` 출력 기준, Day 1 devops가 적용한 4개 리소스 모두 정상 등록됨을 확인.

### 2.2 Phase 5.2 실증 테스트 항목 (Day 3 예정)

1. **서킷 브레이커 실증** — `kubectl delete pod -l app=ai-adapter -n rummikub` → 30초 이내 신 Pod Ready, outlier detection 이벤트 확인
   - 주의: ai-adapter 여분 Pod 없음 → 1회만 실행
2. **타임아웃 정합** — VirtualService timeout(510s) = ConfigMap AI_ADAPTER_TIMEOUT_SEC(500s) + 10초 버퍼
   - 선결 블로커(Day 1): `istio/virtual-service-ai-adapter.yaml` timeout 200→510s 패치 필요 (`I1` 플래그, Day 1 장표 참조)
3. **재시도 중첩 분석** — Istio retry 1회(5xx/reset만) + Game Engine 최대 3회(invalid move) → 네트워크 장애 시 최대 2회, 비즈니스 재시도 최대 3회, 중복 없음 확인
4. **Place Rate 회귀 없음** — Day 1 QA 결과(Go 717 / AI Adapter 428 / E2E 58) 재확인 또는 샘플 대전 1회

### 2.3 ArgoCD 상태

- Application rummikub: `sync=OutOfSync, health=Progressing`
- 원인: 본 커밋의 ollama strategy 변경과 Istio CR 일부(자동 sync 대상 아님) drift. Day 2 후반 또는 Day 3에 sync 계획.

## 3. 결론

Phase 5.2 리소스 4건은 클러스터에 정상 적용 상태이며, 실증 테스트를 위한 선결 조건(ollama rollout 해소)이 본 작업(Recreate 전환)으로 충족되었다. 실증 테스트 시나리오는 Day 3에 수행한다.

## 4. 다음 단계

- Day 3: Phase 5.2 실증 테스트 수행 (서킷 브레이커/재시도/타임아웃/회귀)
- Day 3: Phase 5.3 관측성 (istioctl proxy-status 스크립트, 메모리 여유 조건부)
- Day 3: `istio/virtual-service-ai-adapter.yaml` timeout 510s 패치 (I1)
