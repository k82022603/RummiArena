# Istio Install 드라이런 검토 보고 (2026-04-12)

- 검토자: devops
- 목적: Sprint 6 Phase 5.0(2026-04-13~) 착수 전 사전 검증
- 범위: 스크립트/설정 리뷰만 수행. 실제 설치/apply 금지.
- 전제: bash 실행 권한이 현재 세션에서 차단되어 `bash -n` syntax check와 `kubectl get` 상태 조회는 수행하지 못하고 **정적 코드 리뷰로 대체**했다. Sprint 6 Day 1 착수 직전에 실제 환경에서 아래 4개 선행 명령을 반드시 재실행할 것.
  - `bash -n scripts/istio-install.sh`
  - `bash -n scripts/istio-namespace-label.sh`
  - `bash -n scripts/istio-uninstall.sh`
  - `kubectl get ns istio-system; kubectl get crd | grep istio`

---

## 1. 검토 대상 파일

| 파일 | 줄 수 | 역할 |
|------|------|------|
| `scripts/istio-install.sh` | 249 | istioctl 다운로드 + minimal 프로파일 설치 + precheck + verify-install |
| `scripts/istio-namespace-label.sh` | 227 | namespace istio-injection=disabled + Pod annotation 선별 주입 + CRD apply |
| `scripts/istio-uninstall.sh` | 239 | CRD 삭제 + annotation 제거 + rollout restart + istioctl uninstall --purge |
| `docs/02-design/20-istio-selective-mesh-design.md` | 925 | ADR-020 선별 적용 상세 설계 (메모리 프로파일링 + 로드맵) |
| `docs/02-design/27-istio-sprint6-precheck.md` | 781 | Phase 5.0~5.3 Gate 기반 사전 점검표 |
| `istio/peer-authentication-default.yaml` | 13 | namespace 기본 PERMISSIVE mTLS |
| `istio/peer-authentication-ai-adapter.yaml` | 17 | ai-adapter 전용 STRICT mTLS |
| `istio/destination-rule-ai-adapter.yaml` | 30 | 서킷 브레이커 + 연결 풀 + ISTIO_MUTUAL |
| `istio/virtual-service-ai-adapter.yaml` | 23 | 타임아웃 200s + 재시도 1회 |
| `helm/istio-values.yaml` | 63 | game-server/ai-adapter istio.enabled=true 오버라이드 |
| `helm/charts/game-server/values.yaml` | (기존) | `istio.enabled: false` 기본값 + sidecar 리소스 정의 |
| `helm/charts/game-server/templates/deployment.yaml` | (기존) | `{{- if .Values.istio.enabled }}` 조건부 annotation 블록 |
| `helm/charts/ai-adapter/values.yaml` | (기존) | 동일 구조 |
| `helm/charts/ai-adapter/templates/deployment.yaml` | (기존) | 동일 구조 |

총 스크립트 715줄 + 설계 1,706줄 + CRD 4개 + Helm 6개 파일.

---

## 2. 검증 체크리스트 결과

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 1 | 스크립트 bash 문법 (install) | 정적 OK | `set -euo pipefail`, heredoc `YAMLEOF`, `sed -i` 치환 4건, 변수 quoting 일관. bash -n 실제 실행 필요(세션 제약). |
| 2 | 스크립트 bash 문법 (namespace-label) | 정적 OK | `kubectl patch --type=json` 실패 시 `|| { merge 패치 }` fallback 패턴이 heredoc 내 single-quote로 안전. |
| 3 | 스크립트 bash 문법 (uninstall) | 정적 OK | annotation 경로 escape `${ANNO//\//~1}` 문법 정확. `--skip-istiod` 플래그 파싱 정상. |
| 4 | istioctl 버전 pinning | OK | `ISTIO_VERSION=1.24.2` 하드코딩 + 환경변수 오버라이드 가능. 설계/precheck 문서와 일치. |
| 5 | minimal profile (istiod only) 적용 | OK | IstioOperator CR의 `profile: minimal` + `ingressGateways.enabled=false` + `egressGateways.enabled=false` 명시. |
| 6 | Traefik 유지 (Gateway 미사용) | OK | Line 222~228 설치 후 `istio-ingressgateway` 존재 시 경고, 미설치 시 "Traefik이 North-South 전담" 로그. |
| 7 | sidecar injection 대상 제한 (game-server + ai-adapter) | OK | namespace-label.sh에서 `istio-injection=disabled` + 두 deployment에만 annotation patch. 제외 5개 서비스에 명시적 opt-out. |
| 8 | PeerAuth mTLS 정책 일치 | OK | default=PERMISSIVE(namespace) + ai-adapter-strict=STRICT(label selector) 2개. 설계 Section 4.4와 완전 일치. |
| 9 | DestinationRule/VirtualService 정합성 | OK | DR: `consecutive5xxErrors=3, interval=30s, baseEjection=30s, maxEjection=100%` / VS: `timeout=200s, attempts=1, retryOn=5xx,reset`. 설계 Section 4.5 일치. |
| 10 | 메모리 +280Mi 근거 | OK | istiod req 128Mi/lim 256Mi (실측 180Mi) + sidecar 64Mi x 2 (실측 50Mi x 2). 설계 Section 5.1 Table과 일치. |
| 11 | precheck Phase Gate ↔ 스크립트 일치 | 부분 OK | 5.0(설치) + 5.1(sidecar+mTLS)은 스크립트 2개로 분리되어 있으나, 5.2(DR/VS)는 별도 단계가 없고 `istio/*.yaml`이 namespace-label.sh의 마지막 for 루프에서 **한꺼번에** apply됨. 즉 precheck 문서의 "Phase 5.1 적용 → Gate 2 검증 → Phase 5.2 적용" 분리 실행 의도와 약간 차이가 있다. |
| 12 | uninstall CRD 정리 | 부분 OK | PeerAuth/DR/VS는 삭제. 그러나 `istio.io` CRD 자체(예: `peerauthentications.security.istio.io`)는 **경고만** 출력하고 자동 삭제하지 않는다(재설치 가속 목적). 완전 제거 시 수동 `kubectl delete crd` 필요. 설계 의도에 부합(Section 9.3). |
| 13 | 환경 변수/ConfigMap 누락 | OK | `AI_ADAPTER_TIMEOUT_SEC=500`(현재 ConfigMap)과 VirtualService `timeout=200s` 간 **불일치 발견** (아래 이슈 I1 참조). |
| 14 | idempotency (install) | OK | 이미 설치된 경우 `istioctl install` 재실행 시 업그레이드로 동작 (Line 184~188). IstioOperator CR 이름 `rummiarena-minimal` 고정. |
| 15 | idempotency (namespace-label) | OK | `kubectl label --overwrite`, `kubectl patch` 모두 재실행 안전. |
| 16 | idempotency (uninstall) | OK | 리소스 없을 때 건너뛰기 + `|| true` guard 일관 적용. |
| 17 | ArgoCD ignoreDifferences | 미반영 | precheck Section 3.2와 설계 Section 11.1이 요구하지만 `argocd/application.yaml`에 아직 반영되어 있지 않다(아래 이슈 I2). |
| 18 | ArgoCD istio-config Application | 미반영 | precheck Section 5.2와 설계 Section 11.2가 요구하는 별도 `argocd/istio-config.yaml`이 존재하지 않는다(아래 이슈 I3). |
| 19 | `kubectl version --short` deprecation | Minor | install.sh Line 48: `kubectl version --client --short`는 K8s 1.28+에서 deprecation 경고 발생. `|| kubectl version --client -o yaml` fallback이 있어 동작은 함. |
| 20 | `holdApplicationUntilProxyStarts` | OK | install.sh Line 170 meshConfig에 포함. precheck B5(health probe 실패 방지) 대응. |

---

## 3. 발견 이슈 (Sprint 6 Day 1 선반영 필요)

### I1. VirtualService timeout과 AI_ADAPTER_TIMEOUT_SEC 불일치 (Critical)

- **파일**: `istio/virtual-service-ai-adapter.yaml` Line 15
- **내용**: `timeout: 200s` + `perTryTimeout: 200s` 하드코딩
- **현재 ConfigMap**: `AI_ADAPTER_TIMEOUT_SEC=500` (MEMORY.md / 2026-04-10 변경)
- **영향**: Phase 5.2 적용 순간 DeepSeek처럼 200s를 초과하는 추론 요청이 Envoy 레벨에서 강제 종료됨. Round 5 Run 3에서 DeepSeek 최대 356s 관측됨 → **거의 확실히 재현 실패**.
- **조치**: VirtualService의 `timeout`을 `510s`(ConfigMap 500 + 버퍼 10s) 또는 `600s`로 상향. `perTryTimeout`도 동일. 설계 문서(Section 4.5, 7.1)도 함께 갱신.
- **우선순위**: **P0 — Phase 5.2 착수 직전 필수 선반영**. 이 건은 드라이런 검토의 핵심 수확이다.

### I2. ArgoCD ignoreDifferences 미설정 (High)

- **파일**: `argocd/application.yaml` (또는 `argocd/applications/*.yaml`)
- **내용**: precheck Section 3.2가 game-server/ai-adapter Deployment에 대한 ignoreDifferences 블록을 요구하지만 현재 미반영으로 추정 (검토 시점에 해당 파일 내 istio 관련 설정 발견되지 않음).
- **영향**: sidecar 주입 시 ArgoCD가 `/spec/template/spec/containers/1` drift를 감지하고 selfHeal이 무한 루프에 진입할 위험.
- **조치**: Phase 5.1 착수 **전날(04-16)** argocd/application.yaml에 아래 블록 선반영.
  ```yaml
  ignoreDifferences:
    - group: apps
      kind: Deployment
      name: game-server
      namespace: rummikub
      jsonPointers:
        - /spec/template/metadata/annotations/sidecar.istio.io~1status
        - /spec/template/spec/initContainers
        - /spec/template/spec/containers/1
        - /spec/template/spec/volumes
    - group: apps
      kind: Deployment
      name: ai-adapter
      namespace: rummikub
      jsonPointers:
        - /spec/template/metadata/annotations/sidecar.istio.io~1status
        - /spec/template/spec/initContainers
        - /spec/template/spec/containers/1
        - /spec/template/spec/volumes
  ```
- **우선순위**: **P0 — Phase 5.1 착수 전 필수**.

### I3. ArgoCD istio-config Application 파일 부재 (High)

- **파일**: `argocd/istio-config.yaml` (precheck Section 5.2에서 요구)
- **내용**: 현재 `istio/` CRD 매니페스트가 `istio-namespace-label.sh`의 for 루프로만 apply되고 ArgoCD 관리 대상이 아니다. 설계 원칙(GitOps 단일 진실 소스)과 어긋난다.
- **영향**: 수동 apply 후 누군가 `kubectl delete peerauthentication`을 실행하면 복구 경로가 없다. 또한 RummiArena GitOps 원칙 위반.
- **조치**: Phase 5.2 착수 시 `argocd/istio-config.yaml` 신규 작성(precheck 5.2 샘플 YAML 그대로). 스크립트는 초기 1회 bootstrap용으로만 사용하고, 이후 ArgoCD가 소유.
- **우선순위**: **P1 — Phase 5.2 진입 전**.

### I4. namespace-label.sh가 CRD apply까지 수행 (Medium)

- **파일**: `scripts/istio-namespace-label.sh` Line 171~185
- **내용**: 스크립트 5단계에서 `istio/*.yaml`을 모두 apply함으로써 Phase 5.1(sidecar 주입)과 Phase 5.2(트래픽 정책)의 경계가 스크립트 수준에서 사라졌다.
- **영향**: precheck의 Gate 2(mTLS 검증)와 Gate 3(CB/timeout 검증)이 연속 실행되어 개별 Gate 검증이 어려워진다. Day 1 기준 AI 대전이 즉시 실패할 수 있다(I1 timeout 불일치 때문).
- **조치**: 아래 두 가지 중 하나 선택.
  - **옵션 A (권장)**: 스크립트를 `istio-namespace-label.sh`(PeerAuth만) + `istio-traffic-policy.sh`(DR/VS) 2개로 분리.
  - **옵션 B**: 스크립트의 5단계 for 루프에 환경변수 가드(`APPLY_TRAFFIC_POLICY=false` 기본) 추가.
- **우선순위**: P1 — Phase 5.1 검증 후 곧바로 Phase 5.2 진입 전.

### I5. Docker Desktop kubectl top 미동작 가능성 (Low)

- **파일**: `scripts/istio-install.sh` Line 58, 220
- **내용**: `kubectl top nodes`, `kubectl top pods` 호출. Docker Desktop K8s는 metrics-server가 기본 설치되지 않는 경우가 있음.
- **영향**: 메트릭 조회 실패 시 경고만 출력하고 스크립트는 계속 진행(line 59 `|| echo "측정불가"`, line 220 `|| warn`) — **정상 동작**. 다만 메모리 +300Mi 기준 검증(Gate 1)에 제약이 생긴다.
- **조치**: Phase 5.0 당일 `kubectl get apiservice v1beta1.metrics.k8s.io` 로 metrics-server 상태 선확인. 없으면 `kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml`.
- **우선순위**: P2 — Day 1 준비.

### I6. install.sh가 현재 디렉터리를 /tmp로 변경 (Low)

- **파일**: `scripts/istio-install.sh` Line 70 `cd /tmp`
- **내용**: tar 다운로드를 위해 cd 후 원복하지 않음.
- **영향**: 실행 후 쉘 위치가 /tmp로 변경됨(sub-shell이라 호출 쉘에는 무영향). idempotency에는 문제없음.
- **조치**: `pushd /tmp && ... && popd` 또는 `(cd /tmp && ...)` subshell로 감싸는 것이 안전. 필수는 아님.
- **우선순위**: P3 — nice-to-have.

### I7. uninstall.sh의 `--skip-istiod` 옵션 문서 누락 (Low)

- **파일**: `scripts/istio-uninstall.sh` Line 18~22
- **내용**: `--skip-istiod` 옵션이 스크립트 주석에만 있고, precheck 문서 Section 4.3 "Level 1 즉시 롤백" 절차에는 이 옵션이 언급되지 않음. 부분 롤백 경로가 있는데 운영자가 알 수 없다.
- **조치**: 27번 precheck 문서의 롤백 절차에 "부분 롤백 시 `--skip-istiod` 옵션 사용" 1줄 추가.
- **우선순위**: P2 — 문서 보강.

### I8. kubectl version --short deprecation (Minor)

- **파일**: `scripts/istio-install.sh` Line 48
- **내용**: `kubectl version --client --short` — K8s 1.28+에서 deprecation.
- **영향**: fallback이 있어 실패하지 않음. 경고 로그만 발생.
- **조치**: `kubectl version --client -o yaml | grep gitVersion`로 교체해도 무방. 필수 아님.
- **우선순위**: P3.

---

## 4. 권장 조치 (Day 1 착수 순서)

| 순번 | 일시 | 작업 | 우선순위 | 담당 |
|------|------|------|---------|------|
| 1 | 04-13 오전 | 세션 초기 sanity: `bash -n` 3개 스크립트 + `kubectl get ns istio-system` + `kubectl get crd|grep istio` 실행, 결과 로그 | P0 | DevOps |
| 2 | 04-13 오전 | **I1 수정**: `istio/virtual-service-ai-adapter.yaml`의 timeout/perTryTimeout을 `510s`로 변경 + 20-design/27-precheck 문서의 수치 동시 갱신 (코드 수정 SKILL 절차 준수) | P0 | DevOps + Architect 리뷰 |
| 3 | 04-13 오전 | metrics-server 가동 확인, 없으면 설치 | P2 | DevOps |
| 4 | 04-13 오후 | Phase 5.0 착수: `bash scripts/istio-install.sh` (istiod만) | P0 | DevOps |
| 5 | 04-13 오후 | istiod READY + `kubectl top pods -n istio-system < 200Mi` 확인 | Gate 1 | DevOps |
| 6 | 04-14~15 | 48h 안정성 관찰 (istiod RESTARTS=0, rummikub 7 Pod 무영향) | Gate 1 | DevOps |
| 7 | 04-15 | **I2 수정**: `argocd/application.yaml`에 ignoreDifferences 4건 추가 + ArgoCD sync 확인 | P0 | DevOps |
| 8 | 04-16 | **I4 수정**: `istio-namespace-label.sh`에서 CRD apply 부분을 환경변수 가드 또는 별도 스크립트로 분리 | P1 | DevOps |
| 9 | 04-16 | Phase 5.1: namespace-label + PeerAuth만 적용 (트래픽 정책 보류) | Gate 2 | DevOps |
| 10 | 04-17 | Phase 5.1 검증: READY 2/2, `istioctl authn tls-check`, health check, **AI 대전 1회**(DeepSeek, 500s timeout 존중 확인) | Gate 2 | DevOps + QA |
| 11 | 04-18 | **I3 반영**: `argocd/istio-config.yaml` 신규 작성 + Phase 5.2 DR/VS 적용 (I1 수정본) | P1 | DevOps |
| 12 | 04-19 | Phase 5.2 검증: 서킷 브레이커 동작 테스트(ai-adapter 강제 종료) + AI 대전 3모델 통합 | Gate 3 | DevOps + QA |
| 13 | 04-20~21 | Phase 5.3 관측성(메모리 여유 시 Kiali) + 통합 보고서 | - | DevOps |

---

## 5. 최종 결론

- **Ready to execute Phase 5.0 on 2026-04-13**: **Not Ready** (Phase 5.0 단독은 Ready, 그러나 Phase 5.2 적용 전에 I1/I2/I3/I4 선반영 필수)
- **리스크 등급**: **Medium** (Critical 이슈 1건, High 이슈 2건, Medium 이슈 1건, Low 이하 4건)
- **핵심 이슈 수**: 8건 (P0=3, P1=2, P2=2, P3=1)

### 결정 근거 요약

Phase 5.0(istiod 설치)은 **즉시 착수 가능**하다. 3개 스크립트의 정적 검증, minimal profile 설정, 멱등성, 롤백 경로 모두 설계 의도에 부합한다.

그러나 **I1(VirtualService timeout 200s ↔ ConfigMap 500s 불일치)**은 Phase 5.2에서 DeepSeek 추론을 강제 종료시키므로 반드시 Day 1에 수정해야 한다. 이것을 놓치면 Round 5 Run 3에서 달성한 30.8% place rate가 Istio 환경에서 재현되지 않고 Gate 3(AI 대전 무영향)을 통과하지 못한다.

**I2(ArgoCD ignoreDifferences 미반영)**와 **I3(istio-config Application 부재)**는 GitOps 원칙 준수 및 selfHeal 무한 루프 방지를 위해 Phase 5.1/5.2 착수 전까지 선반영되어야 한다.

**I4(스크립트 단계 경계 소실)**는 Gate 검증을 방해하므로 5.1과 5.2 사이 분리가 필요하나 옵션 B(환경변수 가드)로 30분 내 해결 가능.

### 정적 검증 한계

본 드라이런은 bash 실행이 차단된 세션 제약으로 **실제 `bash -n` 구문 검증과 `kubectl get` 상태 조회를 수행하지 못했다**. 정적 코드 리뷰 수준에서 3개 스크립트의 heredoc/변수/루프/escape를 모두 확인했으나, 실제 실행 환경에서 최종 검증이 필수이다. Sprint 6 Day 1 착수 직전 위 "권장 조치 1번"을 반드시 수행할 것.

### 참고

- 본 보고서는 Sprint 6 Day 1 오전 첫 번째 action item으로 직접 참조 가능.
- I1 수정은 `.claude/skills/code-modification/SKILL.md` 절차를 따라 (계획→수정→검증→커밋) 진행한다.
- 27번 precheck 문서의 8번 부록 "점검 일정"에는 04-14 istioctl 설치로 되어 있으나, 본 보고서는 04-13 착수를 전제로 한다. 일정 합의 필요 시 PM과 조율.

---

> 문서 이력
> - v1.0 (2026-04-12): 초안 작성 — devops (Sprint 6 착수 전 드라이런 검토)
