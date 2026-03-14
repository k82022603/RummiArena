# Grafana 매뉴얼

## 1. 개요

Grafana는 Prometheus가 수집한 메트릭을 시각화하는 대시보드 도구다.
RummiArena에서는 게임 서버 성능, AI Adapter LLM 호출 현황, K8s 인프라 상태를
실시간으로 모니터링하는 세 종류의 대시보드를 운영한다.

kube-prometheus-stack Helm Chart에 포함되어 Prometheus와 함께 설치된다.

### 1.1 RummiArena 대시보드 구성

```mermaid
flowchart TB
    subgraph Grafana["Grafana 대시보드 (Phase 5)"]
        D1["Game Server Dashboard\n활성 게임 수 / API 응답 시간 / 에러율 / WebSocket 연결"]
        D2["AI Adapter Dashboard\nLLM 호출 수 / 모델별 응답 시간 / Fallback 비율"]
        D3["K8s Infra Dashboard\nPod CPU·Memory / Node 리소스 / PVC 사용량"]
    end

    Prom["Prometheus\n(데이터 소스)"] --> D1
    Prom --> D2
    Prom --> D3
```

### 1.2 도입 시점

Phase 5 (Prometheus + Istio 도입 시 함께 활성화).
Phase 1~4는 `kubectl top pods` 와 Traefik Dashboard로 대체한다.

---

## 2. 설치

### 2.1 kube-prometheus-stack에 포함 설치

Grafana는 Prometheus 매뉴얼(11-prometheus.md)의 `kube-prometheus-stack` 설치 시 자동으로 함께 설치된다.
별도 설치 절차 없이 아래 확인 명령어만 실행한다.

```bash
# Grafana Pod 확인
kubectl get pod -n monitoring -l app.kubernetes.io/name=grafana

# Grafana Service 확인
kubectl get svc -n monitoring kube-prometheus-stack-grafana
```

### 2.2 초기 관리자 비밀번호 확인

```bash
kubectl get secret -n monitoring kube-prometheus-stack-grafana \
  -o jsonpath="{.data.admin-password}" | base64 -d && echo
# 기본값: prom-operator
```

### 2.3 웹 UI 접근

```bash
kubectl port-forward svc/kube-prometheus-stack-grafana -n monitoring 3001:80
# 브라우저: http://localhost:3001
# ID: admin / PW: 위에서 확인한 값
```

> **포트 충돌 주의**: frontend는 NodePort 30000, Next.js 개발 서버는 3000을 사용하므로 Grafana는 3001로 포트 포워딩한다.

### 2.4 Traefik Ingress로 Grafana UI 노출 (선택)

```yaml
# argocd/ingress-route-monitoring.yaml에 추가
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: grafana
  namespace: monitoring
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`grafana.localhost`)
      kind: Rule
      services:
        - name: kube-prometheus-stack-grafana
          port: 80
```

```bash
kubectl apply -f argocd/ingress-route-monitoring.yaml
# 이후 http://grafana.localhost 접근 가능
```

---

## 3. 프로젝트 설정

### 3.1 Prometheus 데이터 소스 확인

kube-prometheus-stack 설치 시 Prometheus 데이터 소스가 자동으로 등록된다.
Grafana UI > Connections > Data Sources > Prometheus 항목에서 확인한다.

URL은 클러스터 내부 주소를 사용한다:

```
http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090
```

### 3.2 대시보드 프로비저닝 (ConfigMap)

대시보드 JSON을 ConfigMap으로 관리하면 재기동 후에도 유지된다.

```yaml
# helm/charts/monitoring/templates/grafana-dashboards-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboards-rummikub
  namespace: monitoring
  labels:
    grafana_dashboard: "1"   # Grafana sidecar가 자동 감지
data:
  game-server.json: |
    { ... }   # 아래 3.3 참고
  ai-adapter.json: |
    { ... }
  k8s-infra.json: |
    { ... }
```

> `grafana_dashboard: "1"` 레이블이 있는 ConfigMap은 Grafana가 자동으로 로드한다.

### 3.3 Game Server 대시보드 패널 구성

**대시보드 ID: `rummikub-game-server`**

| 패널 이름 | 시각화 유형 | PromQL |
|----------|-----------|--------|
| 활성 게임 수 | Stat | `rummikub_active_games` |
| 총 턴 처리 수 | Stat | `rummikub_turns_total` |
| WebSocket 연결 수 | Time series | `rummikub_websocket_connections` |
| API 평균 응답 시간 | Time series | `rate(rummikub_http_request_duration_seconds_sum[5m]) / rate(rummikub_http_request_duration_seconds_count[5m])` |
| API 에러율 (5xx) | Time series | `rate(rummikub_http_request_duration_seconds_count{status=~"5.."}[5m]) / rate(rummikub_http_request_duration_seconds_count[5m])` |
| 경로별 요청 수 | Bar chart | `sum by (path) (rate(rummikub_http_request_duration_seconds_count[5m]))` |

```mermaid
flowchart TB
    subgraph GameDashboard["Game Server Dashboard"]
        P1["Stat: 활성 게임 수\nrummikub_active_games"]
        P2["Stat: 총 턴 처리\nrummikub_turns_total"]
        P3["Time Series: WebSocket 연결\n실시간 연결 수 추이"]
        P4["Time Series: API 응답 시간\np50 / p90 / p99"]
        P5["Time Series: 에러율\n5xx / 4xx 비율"]
        P6["Bar Chart: 경로별 요청 수\n/api/v1/* 분류"]
    end
```

### 3.4 AI Adapter 대시보드 패널 구성

**대시보드 ID: `rummikub-ai-adapter`**

| 패널 이름 | 시각화 유형 | PromQL |
|----------|-----------|--------|
| 모델별 LLM 호출 수 | Bar chart | `sum by (model) (rate(llm_requests_total[5m]))` |
| LLM 평균 응답 시간 | Time series | `rate(llm_duration_seconds_sum[5m]) / rate(llm_duration_seconds_count[5m])` |
| Fallback 비율 | Gauge | `rate(llm_fallback_total[5m]) / rate(llm_requests_total[5m])` |
| 모델별 성공/실패 | Pie chart | `sum by (model, status) (llm_requests_total)` |
| LLM p95 응답 시간 | Time series | `histogram_quantile(0.95, rate(llm_duration_seconds_bucket[5m]))` |

```mermaid
flowchart TB
    subgraph AIDashboard["AI Adapter Dashboard"]
        A1["Bar Chart: 모델별 LLM 호출 수\nOpenAI / Claude / DeepSeek / Ollama"]
        A2["Time Series: 모델별 응답 시간\np50 / p95 비교"]
        A3["Gauge: Fallback 비율\n목표값: 5% 미만"]
        A4["Pie Chart: 성공/실패 비율\n모델별 분류"]
        A5["Time Series: p95 응답 시간\n게임 턴 타임아웃(10s) 기준선 표시"]
    end
```

### 3.5 K8s 인프라 대시보드 패널 구성

**대시보드 ID: `rummikub-k8s-infra`**

kube-prometheus-stack이 제공하는 기본 대시보드(ID: 315, 1860)를 활용하고,
rummikub 네임스페이스 필터를 추가한다.

| 패널 이름 | 시각화 유형 | PromQL |
|----------|-----------|--------|
| Pod CPU 사용량 | Time series | `sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="rummikub"}[5m]))` |
| Pod Memory 사용량 | Time series | `sum by (pod) (container_memory_working_set_bytes{namespace="rummikub"})` |
| PVC 사용량 | Stat | `kubelet_volume_stats_used_bytes{namespace="rummikub"}` |
| ResourceQuota 사용률 | Gauge | `kube_resourcequota{namespace="rummikub", type="used"}` |

---

## 4. 주요 명령어 / 사용법

### 4.1 대시보드 내보내기 / 가져오기

```bash
# Grafana UI에서 대시보드 내보내기
# Dashboard > 설정(톱니바퀴) > JSON Model 탭 > 클립보드 복사

# 또는 API로 내보내기
curl -s http://admin:prom-operator@localhost:3001/api/dashboards/uid/rummikub-game-server \
  | jq '.dashboard' > grafana-dashboards/game-server.json

# 가져오기 (API)
curl -X POST http://admin:prom-operator@localhost:3001/api/dashboards/import \
  -H "Content-Type: application/json" \
  -d @grafana-dashboards/game-server.json
```

### 4.2 대시보드 ConfigMap 적용

```bash
kubectl apply -f helm/charts/monitoring/templates/grafana-dashboards-configmap.yaml

# Grafana Pod 재기동 없이 반영 (sidecar가 자동 감지)
kubectl rollout restart deployment/kube-prometheus-stack-grafana -n monitoring
```

### 4.3 알림 규칙 설정 (PrometheusRule)

```yaml
# helm/charts/monitoring/templates/alert-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: rummikub-alerts
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: rummikub.game-server
      rules:
        - alert: HighAPIErrorRate
          expr: |
            rate(rummikub_http_request_duration_seconds_count{status=~"5.."}[5m])
            / rate(rummikub_http_request_duration_seconds_count[5m]) > 0.05
          for: 2m
          labels:
            severity: warning
          annotations:
            summary: "Game Server 에러율 5% 초과"
            description: "최근 5분간 API 에러율: {{ $value | humanizePercentage }}"

        - alert: LLMFallbackHighRate
          expr: |
            rate(llm_fallback_total[5m]) / rate(llm_requests_total[5m]) > 0.1
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: "LLM Fallback 비율 10% 초과"
            description: "AI Adapter Fallback 비율이 임계값을 초과했습니다."
```

### 4.4 Grafana 커뮤니티 대시보드 Import

Grafana.com에서 검증된 대시보드를 바로 가져올 수 있다.

```
Grafana UI > + > Import > 대시보드 ID 입력

권장 ID:
- 315  : Kubernetes cluster monitoring (via Prometheus)
- 1860 : Node Exporter Full
- 7362 : PostgreSQL Database
- 763  : Redis Dashboard
- 11462: Traefik 2
```

---

## 5. 트러블슈팅

| 문제 | 원인 | 해결 |
|------|------|------|
| 대시보드 데이터 없음 | Prometheus 데이터 소스 미연결 | Data Sources > Prometheus URL 확인 |
| 패널에 `No data` | PromQL 쿼리 오류 또는 메트릭 미수집 | Prometheus UI > Graph 탭에서 쿼리 직접 확인 |
| ConfigMap 대시보드 미반영 | `grafana_dashboard: "1"` 레이블 누락 | ConfigMap 레이블 추가 후 재적용 |
| Grafana Pod OOM | 메모리 limits 초과 | `limits.memory: 256Mi` → `512Mi` 로 조정 |
| 비밀번호 분실 | 초기화 필요 | `kubectl exec`으로 Grafana admin CLI로 리셋 또는 Secret 재확인 |
| 포트 충돌 (3000) | frontend NodePort와 충돌 | Grafana는 반드시 `port-forward 3001:80` 사용 |

---

## 6. 참고 링크

- 공식 문서: https://grafana.com/docs/grafana/latest/
- kube-prometheus-stack: https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack
- PromQL 내장 대시보드: https://grafana.com/grafana/dashboards/
- Grafana Alerting 가이드: https://grafana.com/docs/grafana/latest/alerting/
