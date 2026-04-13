# 35. Ollama Deployment Rollout 블로커 분석 및 수정안

- 작성일: 2026-04-13 (Sprint 6 Day 1)
- 작성자: devops (Agent Teams, devops-analyzer)
- 상태: 제안(Proposal) — 권고안 B + D 조합
- 연관: Sprint 6 Phase 5.1 (Istio namespace label/injection) 병행 작업 검증 중 발견
- 선행 문서: `docs/02-design/20-istio-selective-mesh-design.md`, `argocd/application.yaml`

## 1. 현상 요약

### 1.1 ArgoCD Application 상태

```
rummikub  sync=OutOfSync  health=Degraded
operationState: "one or more synchronization tasks completed unsuccessfully (retried 5 times)"
```

### 1.2 ollama Deployment 상태 (`kubectl describe deployment ollama -n rummikub`)

| 항목 | 값 |
|------|-----|
| `metadata.generation` | 12 |
| `deployment.kubernetes.io/revision` | 8 |
| `Conditions[Available]` | True (MinimumReplicasAvailable) |
| `Conditions[Progressing]` | **False (ProgressDeadlineExceeded)** |
| `Conditions[ReplicaFailure]` | **True (FailedCreate)** |
| `restartedAt` (템플릿 annotation) | `2026-04-13T11:16:33+09:00` |
| `rummiarena/reconcile-trigger` | `1776046579` (2026-04-13 02:14Z 갱신) |
| ReplicaSets | `ollama-cddb7cfcc (1/1)` · `ollama-84d6d45479 (0/1 desired 1)` · others 0 |

### 1.3 구 RS vs 신 RS

| | 구 RS `ollama-cddb7cfcc-zphb6` | 신 RS `ollama-84d6d45479` |
|---|-----|-----|
| 상태 | Running, 1/1 Ready, 서비스 무중단 | FailedCreate 루프 (0/1) |
| Pod Spec `resources.limits.memory` | **4Gi** (이미 반영된 상태) | **4Gi** (동일) |
| Pod 생성 시각 | 2026-04-13 02:14:10Z (25분 전) | Pod 자체 생성 실패 |
| API 응답 | `/api/tags` 200 OK (readinessProbe, GIN 로그 확인) | 해당 없음 |

### 1.4 이벤트 (`kubectl get events` 필터)

```
25m  Normal   ScalingReplicaSet   deployment/ollama   Scaled up replica set ollama-675bb8c54d from 0 to 1
25m  Normal   ScalingReplicaSet   deployment/ollama   Scaled down replica set ollama-675bb8c54d from 1 to 0
22m  Normal   ScalingReplicaSet   deployment/ollama   Scaled up replica set ollama-84d6d45479 from 0 to 1
22m+ Warning  FailedCreate        rs/ollama-84d6d45479
     Error creating: pods "ollama-84d6d45479-*" is forbidden:
     exceeded quota: rummikub-quota,
     requested: limits.memory=4Gi,
     used: limits.memory=5824Mi,
     limited: limits.memory=8Gi
6m   Warning  FailedCreate        (combined from similar events, 재시도 계속)
```

즉 **신 RS 0개 Pod 성공**, rollout이 progressDeadlineSeconds(600s) 초과로 정체되어 `Progressing=False, ReplicaFailure=True` 조건이 세팅된 상태. 구 RS Pod는 여전히 Running이라 서비스 영향은 현재 없다.

## 2. 근본 원인 분석

### 2.1 ResourceQuota 산술 (현재 상태)

`kubectl get resourcequota rummikub-quota -n rummikub -o yaml` 기준:

```yaml
spec.hard:
  limits.cpu:    "8"
  limits.memory: 8Gi
  pods:          "20"
  requests.cpu:    "4"
  requests.memory: 4Gi
status.used:
  limits.cpu:    "4"
  limits.memory: 5824Mi     # ← 한도 8Gi의 71%
  pods:          "7"
```

7개 Pod의 `limits.memory` 내역:

| Pod | `limits.memory` | 합산 |
|-----|-----------------|------|
| `ollama-cddb7cfcc-zphb6` | 4096Mi | 4096 |
| `ai-adapter` (istio-proxy 없음) | 128 + 256 | 384 |
| `game-server` | 128 + 256 | 384 |
| `admin` | 256 | 256 |
| `frontend` | 256 | 256 |
| `postgres` | 256 | 256 |
| `redis` | 192 | 192 |
| **합계** | | **5824Mi** |

새 ollama Pod 하나를 띄우려면 추가로 4096Mi가 필요 → `5824 + 4096 = 9920Mi > 8192Mi` → Quota 초과. 신 RS Pod 생성 요청이 admission 단계에서 forbidden.

### 2.2 왜 Deployment는 새 RS를 만들려고 하는가?

핵심 관측:

1. **구 RS Pod도 이미 4Gi limit로 동작 중**이다. 즉 "4Gi 변경"이라는 스펙 변경 자체는 과거에 성공적으로 적용 완료된 상태다.
2. 오늘(2026-04-13) 오전에 Deployment에 두 개의 trigger annotation이 업데이트되었다.
   - `spec.template.metadata.annotations["kubectl.kubernetes.io/restartedAt"] = "2026-04-13T11:16:33+09:00"`
   - `metadata.annotations["rummiarena/reconcile-trigger"] = "1776046579"`
3. Pod template hash가 바뀌는 값 변경(= `restartedAt` annotation 변경)은 **Deployment controller가 새 RS를 생성하도록 강제**한다.
4. 새 RS 템플릿의 `limits.memory`는 Helm values 그대로 4Gi. Deployment controller가 maxSurge 25%로 "구 Pod는 살려두고 새 Pod를 먼저 띄우는" RollingUpdate 경로를 선택.
5. 그러나 구 Pod 자체가 이미 4Gi를 쓰고 있으므로, 새 Pod 4Gi 추가는 quota를 넘어 실패한다.

즉 **"rollout restart 트리거 + maxSurge RollingUpdate + 한 Pod 분량 헤드룸 부재"의 3박자가 원인**이다. 메모리 값이 변해서 실패한 게 아니라, 이미 fit-tight하게 배치된 Deployment를 기존 전략으로 restart하려니 "동시에 두 개가 떠야 하는 찰나"를 quota가 거부한 것.

### 2.3 ArgoCD ignoreDifferences 경로는 왜 무력한가?

`argocd/application.yaml:61-67` 에 다음 경로가 이미 등록되어 있다:

```yaml
- group: apps
  kind: Deployment
  name: ollama
  namespace: rummikub
  jsonPointers:
    - /spec/template/spec/containers/0/resources/limits/memory
    - /spec/template/spec/containers/0/resources/requests/memory
```

그런데 실상:

- **ignoreDifferences는 "ArgoCD diff 비교 시 해당 경로 차이를 무시"하는 기능**이다. 즉 Git(4Gi)과 클러스터(예: 수동 patch 2Gi)가 달라도 OutOfSync로 치지 않는다는 뜻.
- **Git 상 Helm values가 4Gi로 commit 되어 있고 클러스터도 4Gi인 상황에서는 애초에 무시할 diff가 없다.** ignoreDifferences는 이 시나리오에서 사실상 no-op.
- 게다가 오늘 발생한 트리거는 `resources.limits.memory` 경로 변경이 아니라 `spec.template.metadata.annotations.kubectl.kubernetes.io/restartedAt` 변경이다. 이 경로는 ignore 목록에 없으므로 그 자체가 drift로 인식되었을 가능성이 있고, 더 직접적으로는 **누군가 `kubectl rollout restart deployment/ollama -n rummikub`를 실행했을 때 Deployment controller가 곧바로 새 RS 생성을 시도**했다.

즉 ignoreDifferences 추가(2026-03-31 commit `45f5b10`)는 "Git=4Gi vs 예전 수동 patch=2Gi" 차이를 ArgoCD가 selfHeal로 덮어쓰지 못하게 하려던 조치였다. 현재 겪는 FailedCreate 루프와는 다른 문제다.

### 2.4 `helm/charts/ollama/values.yaml` 이력

```
34d0da7 (2026-03-25) feat: Ollama K8s 배포 + WSL2 설치 가이드 업데이트
  - defaultModel: "gemma3:1b"
  - limits.memory: "2Gi"
45f5b10 (2026-03-31) 데일리 마감 (2026-03-31)
  - defaultModel: "gemma3:1b" → "qwen2.5:3b"
  - requests.memory: "512Mi" → "1Gi"
  - limits.memory: "2Gi" → "4Gi"   ← 해당 변경
```

qwen2.5:3b (3B 파라미터, 약 1.9GB 모델) 전환 시 "추론 피크 시 2Gi OOMKilled 우려"로 선제적으로 4Gi로 올린 것. 2026-03-31~2026-04-12 기간 동안은 `rollout restart`가 없었으므로 구 RS가 4Gi로 정상 동작만 했고 quota 합계(5824Mi)로 안정 운영되었다. 오늘 restart가 새 Pod를 한 개 더 띄우려는 순간 처음으로 문제가 드러났다.

### 2.5 Istio 작업과의 관계

Sprint 6 Day 1 Istio Phase 5.1(namespace label + sidecar injection) 검증 도중 `kubectl rollout restart`가 실행되었다. istio-injection 활성화 후 sidecar 주입을 반영하려면 rollout restart가 사실상 필수다. ollama는 Istio 선별 적용 대상에서 **제외**되어 있으나(design doc 20 기준 game-server/ai-adapter 2개만 sidecar 주입), istio-injection=enabled 라벨은 ns 전체에 적용되므로 "모든 Pod를 restart해서 sidecar 상태 일치시키기" 작업 흐름에서 ollama까지 restart 대상에 포함되었을 가능성이 높다.

해결책은 "ollama를 restart 대상에서 제외"보다 **ollama rollout을 구조적으로 quota-safe하게 만드는 것**이 맞다. Istio 작업이 아니어도 향후 image tag 변경, helm upgrade, 노드 재스케줄 등 어떤 이유로든 재배포가 필요하기 때문이다.

## 3. 서비스 영향

### 3.1 현재 — 무중단

- 구 RS Pod `ollama-cddb7cfcc-zphb6`가 Running. `readinessProbe GET /api/tags` 200 응답 로그 확인:
  ```
  [GIN] 2026/04/13 - 02:40:04 | 200 | 718.842µs | 10.1.0.1 | GET "/api/tags"
  ```
- Service `ollama:11434` 정상. ai-adapter → ollama 경로 영향 없음.
- 현재 진행 중인 Sprint 5 W2 까지의 테스트/대전 결과(Round 5 DeepSeek 등)에는 영향 없음. Ollama 기반 대전은 R5에서 실행된 이력 없이 클라우드 3모델 위주.

### 3.2 잠재 리스크

1. **Istio Phase 5.2~5.3** 진행 중 game-server/ai-adapter 재배포가 triggering되면 "어차피 OutOfSync인데 한 번에 sync 하자" 흐름에서 ArgoCD가 ollama RS까지 재시도 → 구 Pod가 혹시라도 삭제되면 즉시 서비스 다운.
2. **구 RS Pod가 ReplicaFailure 상태에서 삭제 대상이 되는 경로**: Deployment rollout status가 ProgressDeadlineExceeded이므로, 운영자가 "rollout undo" 또는 "force sync replace"를 시도하면 구 Pod가 먼저 삭제되고 재생성 시에도 동일 quota에 걸려 **진짜 서비스 중단**이 발생한다.
3. **ArgoCD selfHeal 루프**: OutOfSync 상태로 selfHeal이 5분마다 재시도. 현재는 FailedCreate로 고정되지만, 매 시도마다 K8s API 서버에 불필요한 부하.

## 4. 옵션 분석

4개 옵션을 제시한다. 각각 "무엇을 바꾸는가 / 난이도 / 리스크 / 회귀 범위 / 소요시간".

### 옵션 A — ResourceQuota limits.memory 8Gi → 10~12Gi 증설

- **변경**: `helm/templates/resource-quota.yaml` 또는 umbrella values에서 `limits.memory` 증설.
- **난이도**: 낮음. YAML 한 줄 수정 + git commit + ArgoCD sync.
- **리스크**: **중대**. 16GB 하드웨어 제약 전제가 흔들린다. WSL2 RummiArena 할당 10GB 중 K8s node/Istio/kube-system 오버헤드 감안하면 Pod가 쓸 수 있는 총량이 8Gi 남짓인데, 이를 10Gi로 올리면 실제 메모리 압박 → OOM 빈발 → kubelet eviction. 게다가 Sprint 6에서 Istio sidecar(280Mi × 2) + istiod(~120Mi) ~680Mi 추가 예정. 이를 감안하면 오히려 limit를 더 줄여야 하는 상황.
- **회귀 범위**: 전역. 다른 Pod의 quota 경쟁 패턴이 달라짐.
- **소요시간**: 20분 (값 수정 → sync → 검증).
- **판단**: 하드웨어 한계를 고려하면 근본적으로 맞지 않다. **비권장**.

### 옵션 B — Deployment strategy를 RollingUpdate(maxSurge=0) 또는 Recreate로 변경

- **변경**: `helm/charts/ollama/templates/deployment.yaml`의 `spec.strategy`를 명시:
  ```yaml
  strategy:
    type: Recreate
  ```
  또는
  ```yaml
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 0
      maxUnavailable: 1
  ```
- **효과**: 구 Pod를 먼저 삭제한 뒤 새 Pod를 생성 → "동시에 두 개 떠야 하는 찰나"가 사라짐 → quota에 걸리지 않는다. 5824Mi − 4096Mi(구 삭제) + 4096Mi(신 생성) = 5824Mi로 유지.
- **난이도**: 낮음. Chart 한 블록 추가.
- **리스크**: **작음**. 재배포 시 약 15~40초(qwen2.5:3b pull 캐시 활용 + initContainer 재실행) 다운타임 발생. Ollama는 AI 대전 중에만 필요하며 사용자 대전 세션이 없는 시간대 배포로 완화 가능. ai-adapter가 ollama 불가 시 fallback 없이 에러 반환하므로 배포 창구는 정의 필요.
- **회귀 범위**: ollama 배포 프로세스만. 다른 서비스 영향 없음.
- **소요시간**: 30분 (Chart 수정 → helm lint → dry-run → 커밋 → ArgoCD sync → Pod 교체 검증).
- **Istio 호환성**: ollama는 sidecar 주입 대상 제외라 Istio와 무관. strategy 변경만으로 충분.
- **추가 이득**: 앞으로 image tag 변경이나 env 변경 시에도 동일 quota 문제가 재발하지 않는다. Ollama 같은 "단일 인스턴스 + 대용량 메모리" Pod의 정석 패턴.

### 옵션 C — Helm values ollama memory limit 4Gi → 2Gi 되돌림

- **변경**: `helm/charts/ollama/values.yaml:27` `"4Gi"` → `"2Gi"`.
- **리스크**: **위험**. 2026-03-31 커밋이 gemma3:1b → qwen2.5:3b 전환과 함께 이루어진 이유가 있다. qwen2.5:3b는 3B 파라미터 약 1.9GB 모델이며, 로드 + 추론 컨텍스트 + KV 캐시로 피크 시 2Gi를 넘길 수 있다. 되돌리면 OOMKilled 재발 가능성. 실측 근거 없이 되돌리는 것은 "이전의 발견을 지운다" 오류.
- **검증 필요**: 되돌리려면 최소 3회 `ai-battle-3model-r4.py --models ollama` 실행 후 최대 RSS 측정 → 2Gi 이내 확인 필요. 측정 자체가 Sprint 6 Day 1에 불가능.
- **회귀 범위**: 향후 ollama 기반 테스트/대전 결과에 영향.
- **소요시간**: 변경 20분 + 검증 대전 2~3시간. Sprint 6 Day 1에 부적합.
- **판단**: Sprint 후반 Ollama 정식 튜닝 때 별도 검토. 지금은 **비권장**.

### 옵션 D — 수동 Pod 삭제 후 재rollout (긴급 우회)

- **변경**: `kubectl delete pod ollama-cddb7cfcc-zphb6 -n rummikub` → Deployment controller가 구 RS scale down 후 new RS scale up 재시도.
- **리스크**: **실패 가능**. Deployment 현재 상태가 ProgressDeadlineExceeded + 두 RS 모두 desired=1. Pod 하나 삭제해도 Deployment controller가 어느 RS를 선호할지 결정 로직이 섞일 수 있고, 심한 경우 구 RS(cddb7cfcc) 재생성 + 신 RS(84d6d45479) 재시도가 동시에 일어나 둘 다 FailedCreate로 갈 수 있다.
- **다운타임**: ~1분 + 신 Pod 모델 pull 시간 (PVC 캐시 있으면 ~20s, 없으면 ~180s).
- **회귀 범위**: 없음 (일시적).
- **소요시간**: 5분 실행 + 10분 검증.
- **판단**: 근본 수정이 없는 임시 대응. 문제는 **재발한다**. 옵션 B와 결합하여 "옵션 B 적용 → Pod 1개뿐이니 자연스럽게 교체" 흐름에 녹이는 게 정석.

## 5. 권고안

**옵션 B + 옵션 D 조합 (Strategy Recreate 전환 후 자연 rollout)**

### 5.1 선정 근거

1. **16GB 하드웨어 제약 존중**: Quota 증설(A)은 Istio 추가 메모리(+680Mi)가 예정된 시점에서 오히려 반대 방향.
2. **모델 피크 메모리 보장**: 4Gi limit 유지(C 거부) → qwen2.5:3b 추론 안정성 확보. 검증 없이 2Gi로 되돌리는 회귀는 비용이 더 크다.
3. **구조적 해결**: 옵션 B는 "동시에 두 Pod가 떠야 하는 순간 자체를 없앤다". 향후 image 태그 변경, env 변경, Istio ns 재활성화 등 어떤 트리거에도 재발하지 않는다.
4. **짧은 다운타임 허용 가능**: Ollama는 AI 대전 세션에서만 필요. 배포 윈도우를 "활성 대전 없음" 확인 후로 지정하면 사용자 체감 0. ai-adapter에는 ollama 쿨다운 시 간헐 에러가 나겠지만 재시도 메커니즘이 있다.
5. **Istio 작업과 독립**: Ollama는 Istio 선별 적용 대상 제외이므로 옵션 B 적용은 Istio Phase 5.2~5.3 진행과 병행 가능, 서로 간섭 없음.

### 5.2 한 줄 권고

> **`helm/charts/ollama/templates/deployment.yaml`에 `spec.strategy.type: Recreate`를 추가**하고, helm upgrade 시 Deployment가 구 Pod 삭제 → 신 Pod 생성 순으로 교체되도록 전환한다. 소요시간 30분, 다운타임 ~40초.

## 6. 실행 계획 (권고안 적용 시)

### 6.1 사전 준비 (5분)

```bash
# 1. 활성 AI 대전 없음 확인
kubectl logs -n rummikub deploy/ai-adapter --tail=30 | grep -i "ollama\|AI_LLAMA"

# 2. 현재 상태 스냅샷
kubectl get deployment ollama -n rummikub -o yaml > /tmp/ollama-deployment-before.yaml
kubectl get resourcequota rummikub-quota -n rummikub -o yaml > /tmp/quota-before.yaml

# 3. PVC 캐시 존재 확인 (qwen2.5:3b 재pull 시간 절감)
kubectl exec ollama-cddb7cfcc-zphb6 -n rummikub -c ollama -- ls -la /root/.ollama/models 2>&1 | tail -5
```

### 6.2 Chart 수정 (5분)

`helm/charts/ollama/templates/deployment.yaml` 변경:

```yaml
spec:
  replicas: {{ .Values.replicaCount }}
+ strategy:
+   type: Recreate
  selector:
    matchLabels:
      app: ollama
```

검증:

```bash
helm lint helm/charts/ollama
helm template rummikub helm --values helm/environments/dev-values.yaml \
  --show-only charts/ollama/templates/deployment.yaml \
  | grep -A3 "strategy:"
```

### 6.3 커밋 및 ArgoCD Sync (10분)

```bash
git add helm/charts/ollama/templates/deployment.yaml
git commit -m "fix(ollama): Recreate strategy로 rollout quota 충돌 해소

Sprint 6 Day 1 Istio Phase 5.1 검증 중 발견. ollama Deployment
maxSurge=25% RollingUpdate 전략에서 신 Pod가 구 Pod와 겹쳐 뜨려고
하다 ResourceQuota limits.memory 8Gi 한도를 초과(4Gi+4Gi=8Gi over
5824Mi baseline). Recreate 전략으로 변경하여 순차 교체 보장.

- 다운타임: ~40초 (PVC 캐시 hit 시 ~20초)
- 영향: ai-adapter fallback 없이 ollama 에러 반환 → 배포 윈도우
  필수
- Istio 선별 적용 대상 제외이므로 sidecar 무관"

# ArgoCD selfHeal이 5분 내 자동 반영. 수동 트리거:
kubectl -n argocd patch app rummikub --type=merge -p \
  '{"operation":{"sync":{"revision":"main"}}}'
```

### 6.4 교체 검증 (10분)

```bash
# Deployment controller가 구 Pod 삭제 → 신 Pod 생성 순으로 진행
kubectl get pods -n rummikub -l app=ollama -w
# (ollama-cddb7cfcc-zphb6 Terminating → ollama-<new-hash>-xxx ContainerCreating → Running)

# Ready 확인
kubectl wait --for=condition=Available deployment/ollama -n rummikub --timeout=300s

# ArgoCD 상태 확인
kubectl get application rummikub -n argocd -o jsonpath='{.status.sync.status}{" / "}{.status.health.status}{"\n"}'
# 기대: Synced / Healthy

# 서비스 응답 확인
kubectl logs -n rummikub deploy/ollama --tail=5 | grep "GET /api/tags"

# Quota 재측정
kubectl get resourcequota rummikub-quota -n rummikub -o jsonpath='{.status.used.limits\.memory}'
# 기대: 5824Mi (동일)
```

### 6.5 롤백 경로 (문제 발생 시)

- **증상 1 — 신 Pod ContainerCreating 180초 초과**: PVC 캐시 miss 또는 이미지 pull 지연. `kubectl describe pod <new-pod>`로 확인 후 대기(최대 5분).
- **증상 2 — Pod CrashLoopBackOff**: 4Gi 값이 사실 너무 작았거나 qwen2.5:3b 로딩 실패. OOMKilled 여부 확인:
  ```bash
  kubectl get pod -n rummikub -l app=ollama -o jsonpath='{.items[0].status.containerStatuses[?(@.name=="ollama")].lastState.terminated.reason}'
  ```
  OOMKilled면 옵션 A를 재검토해야 함. 단, 기존 운영에서 2주간 OOM 없이 돌았으므로 가능성 낮음.
- **증상 3 — strategy 변경이 ignoreDifferences와 충돌**: 가능성 없음(ignoreDifferences 경로는 `resources.limits.memory`에 한정).
- **완전 롤백**:
  ```bash
  git revert <commit-sha>
  git push
  # ArgoCD가 이전 상태 복원. 단, 원래 FailedCreate 루프로 돌아감 → 추천 안 함.
  ```

### 6.6 후속 작업

- [ ] 권고안 적용 후 `ai-battle-3model-r4.py --models ollama`로 1회 smoke test (15분)
- [ ] Redis/test-results 정리는 별도 작업(qa-cleaner Task #1)
- [ ] 본 문서 상태를 "제안" → "적용(2026-04-??)"으로 업데이트 + 실행 결과 6.4의 실측치 기록

## 7. Sprint 6 일정 반영

### 7.1 착수 권장 시점

- **Sprint 6 Day 1 (2026-04-13) 오후** 권장.
- Istio Phase 5.0(istiod 설치)와 **병행 불가** (Istio 작업이 ollama Pod도 건드릴 위험). Istio Phase 5.0 완료 후 Phase 5.1 진입 전 틈에 적용 추천.
- **Phase 5.1 이전 실행** 시 이점: istio-injection 라벨링 후 ns 단위 restart 과정에서 ollama도 자연스럽게 Recreate 전략으로 교체되어 blocker 자체가 해소됨.

### 7.2 PM 조율 사항

- Istio Phase 진행 순서를 **5.0 → (ollama strategy 적용 + rollout) → 5.1 → 5.2 → 5.3**으로 재정렬 필요.
- 5.1에서 `kubectl rollout restart` 대상에서 ollama를 제외해도 되지만, strategy 변경이 먼저 적용되어 있으면 제외할 필요 자체가 없어진다.
- AI 대전 스케줄과 충돌 시간대(사용자 접속, PM 시연 등) 확인 필요 — 현재 특이사항 없음 (애벌레 단독 개발 환경).

### 7.3 담당

- **devops 에이전트**: Chart 수정 + helm lint + 커밋 + ArgoCD sync 확인 + smoke test
- **qa 에이전트**: 교체 후 ai-battle-3model-r4.py --models ollama 1회 실행
- **pm 에이전트**: Istio Phase 순서 조정 반영, Sprint 6 Day 1 작업 로그

### 7.4 Definition of Done

- [ ] `helm/charts/ollama/templates/deployment.yaml`에 `strategy.type: Recreate` 반영
- [ ] `kubectl get pods -n rummikub -l app=ollama` — `ollama-<new-hash>` 1/1 Running
- [ ] `kubectl get application rummikub -n argocd` — `Synced / Healthy`
- [ ] `kubectl get resourcequota rummikub-quota -n rummikub -o yaml` — `used.limits.memory ≤ 5824Mi`
- [ ] Ollama `/api/tags` 200 응답 10회 연속 확인
- [ ] Smoke test: ai-battle 1턴 ollama 추론 성공 (선택)

## 8. 부록 — 데이터 원본

### 8.1 명령 실행 결과 (2026-04-13 Sprint 6 Day 1 오전)

```bash
kubectl get pods -n rummikub | grep ollama
# ollama-cddb7cfcc-zphb6        1/1     Running   0          24m

kubectl get rs -n rummikub | grep ollama
# ollama-5655675bf         0         0         0       18d
# ollama-5cf98bb99c        0         0         0       12d
# ollama-84d6d45479        1         0         0       22m   ← 신 RS, desired=1/actual=0
# ollama-cddb7cfcc         1         1         1       13d   ← 구 RS, running

kubectl describe deployment ollama -n rummikub | grep -E "Conditions|FailedCreate|ReplicaSet"
# Conditions:
#   Available        True    MinimumReplicasAvailable
#   ReplicaFailure   True    FailedCreate
#   Progressing      False   ProgressDeadlineExceeded
# OldReplicaSets:  ollama-5655675bf (0/0), ollama-cddb7cfcc (1/1), ollama-5cf98bb99c (0/0)
# NewReplicaSet:   ollama-84d6d45479 (0/1 replicas created)
```

### 8.2 구 RS Pod 자원 실측

```bash
kubectl get pod ollama-cddb7cfcc-zphb6 -n rummikub -o jsonpath='{.spec.containers[0].resources}'
# {"limits":{"cpu":"2","memory":"4Gi"},"requests":{"cpu":"200m","memory":"1Gi"}}
```

### 8.3 Helm values 이력 (git log)

```
34d0da7 (2026-03-25)  +defaultModel: "gemma3:1b"    +limits.memory: "2Gi"
45f5b10 (2026-03-31)  -defaultModel: "gemma3:1b"    -limits.memory: "2Gi"
                      +defaultModel: "qwen2.5:3b"   +limits.memory: "4Gi"
```

### 8.4 ArgoCD application.yaml 관련 블록

```yaml
# argocd/application.yaml:61-67
- group: apps
  kind: Deployment
  name: ollama
  namespace: rummikub
  jsonPointers:
    - /spec/template/spec/containers/0/resources/limits/memory
    - /spec/template/spec/containers/0/resources/requests/memory
```

이 경로는 **rollout 블로커와 무관**하다. 본 문서 §2.3 참조.

---

**승인 요청**: team-lead 검토 후 Sprint 6 Day 1 오후 실행 여부 결정. devops 에이전트는 본 문서의 §6 실행 계획을 따라 즉시 착수 가능 상태.
