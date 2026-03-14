# 시크릿 관리 정책 (Secret Management Policy)

## 1. 개요

### 1.1 목적

본 문서는 RummiArena 프로젝트에서 사용하는 모든 시크릿(API 키, 비밀번호, 토큰, 인증서 등)의 관리 원칙과 구체적인 실행 방안을 정의한다. 시크릿 유출은 프로젝트 전체를 위협하는 P0-critical 사안이므로, 개발 초기 단계부터 엄격한 관리 체계를 수립한다.

### 1.2 적용 범위

| 구분 | 범위 |
|------|------|
| 프로젝트 | RummiArena |
| 환경 | 로컬 개발, Docker Compose, Kubernetes, GitLab CI/CD |
| 대상 | API 키, DB 비밀번호, JWT 시크릿, OAuth 자격증명, TLS 인증서 |

### 1.3 핵심 원칙

1. **시크릿은 소스 코드와 분리한다** — 절대로 Git 리포지토리에 커밋하지 않는다
2. **평문 시크릿은 환경변수 또는 Secret 리소스로만 주입한다** — 코드/설정 파일에 하드코딩 금지
3. **최소 권한 원칙** — 각 서비스는 필요한 시크릿에만 접근한다
4. **로그에 시크릿을 절대 출력하지 않는다** — 마스킹 필수
5. **유출 시 즉시 폐기/교체한다** — 비상 대응 절차를 준수한다

---

## 2. 시크릿 분류

### 2.1 시크릿 인벤토리

```mermaid
graph TB
    subgraph Auth["인증/인가\n(Authentication)"]
        A1["Google OAuth 2.0\nClient ID / Client Secret"]
        A2["JWT Signing Secret\n(HMAC SHA-256)"]
    end

    subgraph DB["데이터베이스\n(Database)"]
        B1["PostgreSQL\nUsername / Password"]
        B2["Redis\nPassword (선택)"]
    end

    subgraph AI["AI API 키\n(LLM Providers)"]
        C1["OpenAI API Key"]
        C2["Claude API Key"]
        C3["DeepSeek API Key"]
    end

    subgraph Infra["인프라/CI\n(Infrastructure)"]
        D1["GitLab CI/CD\nRunner Token"]
        D2["GitLab Container\nRegistry Token"]
        D3["GitHub Token\n(PAT)"]
        D4["카카오톡 API Key\n(REST API Key)"]
    end

    subgraph TLS["TLS/인증서\n(Certificates)"]
        E1["Traefik TLS 인증서\n(Self-signed / Let's Encrypt)"]
        E2["Istio mTLS\n(자동 관리, Phase 5)"]
    end
```

### 2.2 시크릿 상세 목록

| 분류 | 시크릿 이름 | 사용 서비스 | 보안 등급 | 로테이션 주기 |
|------|-----------|-----------|----------|-------------|
| **인증** | `GOOGLE_CLIENT_ID` | game-server | High | 연 1회 또는 유출 시 |
| **인증** | `GOOGLE_CLIENT_SECRET` | game-server | Critical | 연 1회 또는 유출 시 |
| **인증** | `JWT_SECRET` | game-server | Critical | 90일 |
| **인증** | `JWT_REFRESH_SECRET` | game-server | Critical | 90일 |
| **DB** | `POSTGRES_USER` | game-server | High | 변경 불필요 (로컬 dev) |
| **DB** | `POSTGRES_PASSWORD` | game-server, postgres | Critical | 90일 (운영) |
| **DB** | `REDIS_PASSWORD` | game-server, redis | High | 90일 (운영) |
| **AI** | `OPENAI_API_KEY` | ai-adapter | Critical | 90일 또는 유출 시 |
| **AI** | `CLAUDE_API_KEY` | ai-adapter | Critical | 90일 또는 유출 시 |
| **AI** | `DEEPSEEK_API_KEY` | ai-adapter | Critical | 90일 또는 유출 시 |
| **알림** | `KAKAO_REST_API_KEY` | game-server | High | 연 1회 |
| **CI** | `GITLAB_RUNNER_TOKEN` | GitLab Runner | High | Runner 재등록 시 |
| **CI** | `GITHUB_TOKEN` | GitHub CLI, MCP | High | PAT 만료 시 |
| **CI** | `SONARQUBE_TOKEN` | GitLab CI | Medium | 연 1회 |
| **TLS** | TLS 인증서 (tls.crt/tls.key) | Traefik (K8s Secret) | High | 365일 (self-signed) |

---

## 3. 로컬 개발 환경 시크릿 관리

### 3.1 .env 파일 전략

로컬 개발 시 시크릿은 `.env` 파일을 통해 환경변수로 주입한다. `.env.example` 파일은 Git에 커밋하여 필요한 환경변수 키 목록을 공유하고, 실제 값이 담긴 `.env` 파일은 `.gitignore`에 의해 제외한다.

```mermaid
flowchart LR
    subgraph Git["Git 추적\n(커밋 가능)"]
        EX1[".env.example\n(키 + 설명, 값 없음)"]
        DC["docker-compose.yml\n(env_file 참조)"]
    end

    subgraph Local["로컬 전용\n(커밋 금지)"]
        ENV1[".env\n(실제 값 포함)"]
        ENV2["src/game-server/.env"]
        ENV3["src/ai-adapter/.env"]
        ENV4["src/frontend/.env.local"]
    end

    EX1 -->|"개발자가 복사 후\n값 입력"| ENV1
    DC -->|"env_file: .env"| ENV1
```

### 3.2 서비스별 .env 파일 구조

#### 프로젝트 루트 `.env.example`

```bash
# =============================================================================
# RummiArena - 환경 변수 템플릿
# =============================================================================
# 이 파일을 .env로 복사한 후 실제 값을 입력하세요.
#   cp .env.example .env
# [주의] .env 파일은 절대 Git에 커밋하지 마세요.
# =============================================================================

# --- PostgreSQL ---
POSTGRES_USER=rummikub
POSTGRES_PASSWORD=         # 로컬 개발용 비밀번호 입력
POSTGRES_DB=rummikub
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# --- Redis ---
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=            # 비어두면 인증 없이 접속 (로컬 dev)
```

#### `src/game-server/.env.example`

```bash
# --- Server ---
SERVER_PORT=8080
SERVER_ENV=development
LOG_LEVEL=debug

# --- Database ---
DATABASE_URL=postgres://rummikub:${POSTGRES_PASSWORD}@localhost:5432/rummikub?sslmode=disable

# --- Redis ---
REDIS_URL=redis://:${REDIS_PASSWORD}@localhost:6379/0

# --- Auth (Google OAuth 2.0) ---
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URL=http://localhost:8080/api/auth/google/callback

# --- JWT ---
JWT_SECRET=                # openssl rand -base64 64 로 생성
JWT_REFRESH_SECRET=        # openssl rand -base64 64 로 생성
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# --- AI Adapter ---
AI_ADAPTER_URL=http://localhost:8081

# --- 카카오톡 ---
KAKAO_REST_API_KEY=

# --- CORS ---
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

#### `src/ai-adapter/.env.example`

```bash
# --- Server ---
PORT=8081
NODE_ENV=development
LOG_LEVEL=debug

# --- AI API Keys ---
OPENAI_API_KEY=            # sk-...
OPENAI_MODEL=gpt-4o
CLAUDE_API_KEY=            # sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat

# --- Ollama (로컬 LLM) ---
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1

# --- Rate Limiting ---
AI_TIMEOUT_MS=30000
AI_MAX_RETRIES=3
```

#### `src/frontend/.env.example`

```bash
# --- API Endpoints (브라우저 노출 가능) ---
NEXT_PUBLIC_API_URL=http://localhost:8080/api
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
NEXT_PUBLIC_GOOGLE_CLIENT_ID=     # Client ID만 (Secret 노출 금지!)
```

### 3.3 docker-compose.yml 시크릿 분리

현재 `docker-compose.yml`에 PostgreSQL 비밀번호가 평문으로 하드코딩되어 있다. `.env` 파일 참조 방식으로 개선 필요.

**개선안**:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: rummikub-postgres
    env_file:
      - .env
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-rummikub}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-rummikub}
    ports:
      - "5432:5432"
```

---

## 4. Kubernetes 환경 시크릿 관리

### 4.1 Kubernetes Secret 리소스

```mermaid
flowchart TB
    subgraph Secrets["K8s Secrets\n(Namespace: rummikub)"]
        S1["rummikub-db-secret\n(POSTGRES_USER,\nPOSTGRES_PASSWORD)"]
        S2["rummikub-redis-secret\n(REDIS_PASSWORD)"]
        S3["rummikub-auth-secret\n(GOOGLE_CLIENT_ID,\nGOOGLE_CLIENT_SECRET,\nJWT_SECRET)"]
        S4["rummikub-ai-secret\n(OPENAI_API_KEY,\nCLAUDE_API_KEY,\nDEEPSEEK_API_KEY)"]
        S5["rummikub-kakao-secret\n(KAKAO_REST_API_KEY)"]
        S6["rummikub-tls\n(tls.crt, tls.key)"]
    end

    subgraph Pods["Pods"]
        P1["game-server"]
        P2["ai-adapter"]
    end

    S1 -->|envFrom| P1
    S2 -->|envFrom| P1
    S3 -->|envFrom| P1
    S4 -->|envFrom| P2
    S5 -->|envFrom| P1
```

#### Secret 생성 명령

```bash
# DB 시크릿
kubectl create secret generic rummikub-db-secret \
  --from-literal=POSTGRES_USER=rummikub \
  --from-literal=POSTGRES_PASSWORD='<강력한_비밀번호>' \
  --from-literal=POSTGRES_DB=rummikub \
  -n rummikub

# 인증 시크릿
kubectl create secret generic rummikub-auth-secret \
  --from-literal=GOOGLE_CLIENT_ID='<client_id>' \
  --from-literal=GOOGLE_CLIENT_SECRET='<client_secret>' \
  --from-literal=JWT_SECRET="$(openssl rand -base64 64)" \
  --from-literal=JWT_REFRESH_SECRET="$(openssl rand -base64 64)" \
  -n rummikub

# AI API 키 시크릿
kubectl create secret generic rummikub-ai-secret \
  --from-literal=OPENAI_API_KEY='sk-...' \
  --from-literal=CLAUDE_API_KEY='sk-ant-...' \
  --from-literal=DEEPSEEK_API_KEY='<deepseek_key>' \
  -n rummikub

# TLS 인증서 (self-signed)
kubectl create secret tls rummikub-tls \
  --cert=tls.crt --key=tls.key -n rummikub
```

### 4.2 Helm Values에서 시크릿 분리

```yaml
# helm/rummikub/values.yaml (시크릿 값 없음, 이름만 참조)
gameServer:
  secrets:
    dbSecretName: rummikub-db-secret
    redisSecretName: rummikub-redis-secret
    authSecretName: rummikub-auth-secret
aiAdapter:
  secrets:
    aiSecretName: rummikub-ai-secret
```

### 4.3 Sealed Secrets 도입 계획 (Phase 3+)

```mermaid
flowchart LR
    Dev["개발자\n(kubeseal)"] -->|"공개키 암호화"| Seal["SealedSecret\n(암호화 YAML)"]
    Seal -->|"Git 커밋 가능"| GitOps["GitOps Repo"]
    GitOps -->|"ArgoCD Sync"| K8s["K8s Cluster"]
    K8s -->|"Controller\n복호화"| Secret["K8s Secret"]
```

### 4.4 External Secrets (Phase 5+ Vault 연동)

| 구분 | Sealed Secrets | External Secrets (Vault) |
|------|---------------|------------------------|
| 도입 시점 | Phase 3 | Phase 5 |
| 복잡도 | 낮음 | 높음 |
| 로테이션 | 수동 | 자동 가능 |

---

## 5. CI/CD 환경 시크릿 관리

### 5.1 GitLab CI/CD Variables

| 변수 | Protected | Masked | 환경 |
|------|-----------|--------|------|
| `POSTGRES_PASSWORD` | Yes | Yes | All |
| `OPENAI_API_KEY` | Yes | Yes | All |
| `CLAUDE_API_KEY` | Yes | Yes | All |
| `DEEPSEEK_API_KEY` | Yes | Yes | All |
| `SONARQUBE_TOKEN` | Yes | Yes | All |
| `REGISTRY_PASSWORD` | Yes | Yes | All |
| `GOOGLE_CLIENT_SECRET` | Yes | Yes | production |

### 5.2 ArgoCD 시크릿 전략

```mermaid
flowchart TB
    S1["1단계: 수동 생성\n(kubectl create secret)\nPhase 1~2"]
    S2["2단계: Sealed Secrets\n(SealedSecret CRD)\nPhase 3~4"]
    S3["3단계: External Secrets\n(Vault 연동)\nPhase 5+"]
    S1 --> S2 --> S3
```

---

## 6. .gitignore 검증

### 6.1 현재 양호 항목

`.env`, `.env.local`, `.env.*.local`, `.mcp.json`, `*-secret.yaml`, `*-secrets.yaml`, `docker-compose.override.yml`

### 6.2 추가 권장 패턴

```gitignore
# Secrets & Credentials
*.pem
*.key
*.p12
*.pfx
*.jks
secrets/
kubeconfig
*.kubeconfig
.env.production
.env.staging
.docker/
```

### 6.3 기존 보안 이슈

- `docker-compose.yml`에 PostgreSQL 비밀번호(`REDACTED_DB_PASSWORD`) 평문 커밋됨
- 리스크: 로컬 전용이므로 낮지만, `.env` 참조로 변경 필요

---

## 7. TLS 인증서 관리

### 7.1 인증서 전략

```mermaid
flowchart TB
    subgraph Phase14["Phase 1~4 (Self-signed)"]
        SS["openssl로 생성\n(365일 유효)"] --> KS["K8s Secret"] --> T1["Traefik"]
    end
    subgraph Phase5["Phase 5 (cert-manager)"]
        CM["cert-manager\n(자동 갱신)"] --> KS2["K8s Secret\n(자동 생성)"] --> T2["Traefik"]
    end
    Phase14 -->|"Phase 5 전환"| Phase5
```

### 7.2 로컬 Self-signed 인증서

```bash
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 -keyout tls.key -out tls.crt \
  -subj "/CN=rummikub.localhost/O=RummiArena"

kubectl create secret tls rummikub-tls \
  --cert=tls.crt --key=tls.key -n rummikub

# 등록 후 로컬 파일 즉시 삭제
rm tls.key tls.crt
```

---

## 8. 시크릿 로테이션 정책

### 8.1 로테이션 주기

| 시크릿 유형 | 주기 | 방법 |
|-----------|------|------|
| JWT Secret | 90일 | Dual-key 전략으로 무중단 교체 |
| DB Password | 90일 (운영) | ALTER USER → Secret 업데이트 |
| AI API Keys | 90일 또는 유출 시 | Provider 콘솔에서 재발급 |
| Google OAuth Secret | 연 1회 | Google Cloud Console |
| TLS 인증서 | 365일 (self-signed) | 재생성 |

### 8.2 JWT Dual-Key 로테이션 전략

```mermaid
stateDiagram-v2
    [*] --> Normal: JWT_SECRET = Key_A
    Normal --> Rotation: 새 키 생성
    Rotation --> GracePeriod: Key_B로 서명, Key_A+B로 검증
    GracePeriod --> Complete: Access Token 만료 대기 (15분)
    Complete --> [*]: Key_A 제거
```

---

## 9. 접근 제어

### 9.1 서비스별 최소 권한 매트릭스

| Secret | game-server | ai-adapter | frontend |
|--------|:-----------:|:----------:|:--------:|
| `rummikub-db-secret` | O | X | X |
| `rummikub-redis-secret` | O | X | X |
| `rummikub-auth-secret` | O | X | X |
| `rummikub-ai-secret` | X | O | X |
| `rummikub-kakao-secret` | O | X | X |

### 9.2 K8s RBAC

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: secret-admin
  namespace: rummikub
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
```

---

## 10. 감사 로그

### 10.1 추적 대상

| 이벤트 | 기록 방식 |
|--------|----------|
| 시크릿 생성/수정/삭제 | K8s Audit Log (Metadata 수준만) |
| 로테이션 수행 | work_logs/ 변경 기록 |
| 비상 교체 | work_logs/ + 카카오톡 알림 |

### 10.2 K8s Audit Policy

```yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  - level: Metadata
    resources:
      - group: ""
        resources: ["secrets"]
```

> **중요**: Secret에 대해서는 반드시 `Metadata` 수준만 사용. `Request`/`RequestResponse`는 시크릿 값이 감사 로그에 평문 노출됨.

---

## 11. 비상 대응: 시크릿 유출 시

### 11.1 심각도 분류

| 심각도 | 예시 | 대응 시한 |
|--------|------|----------|
| P0-Critical | AI API Key, OAuth Secret 공개 유출 | 즉시 (1시간) |
| P1-High | 로컬 DB 비밀번호 커밋 | 24시간 |
| P2-Medium | GitLab Runner Token 노출 | 48시간 |

### 11.2 대응 플로우

```mermaid
flowchart TB
    Detect["1. 유출 감지"] --> Assess["2. 영향 범위 파악"]
    Assess --> Revoke["3. 즉시 폐기\n(API Key 비활성화)"]
    Revoke --> Replace["4. 새 시크릿 발급"]
    Replace --> Deploy["5. 재배포\n(Rolling Restart)"]
    Deploy --> Audit["6. 사후 분석\n(원인 + 재발 방지)"]
    Audit --> Notify["7. 보고/기록"]
```

### 11.3 Git 이력에서 시크릿 제거

```bash
pip install git-filter-repo
git filter-repo --replace-text <(echo 'REDACTED_DB_PASSWORD==>***REMOVED***')
git push --force --all  # 주의: 협업자 사전 공지 필수
```

---

## 12. 코드 레벨 시크릿 보호

### 12.1 로그 마스킹

**Go (zap)**:
```go
func maskSecret(value string) string {
    if len(value) <= 8 { return "****" }
    return value[:4] + "****" + value[len(value)-4:]
}
```

**NestJS**:
```typescript
function maskSecret(value: string): string {
  if (!value || value.length <= 8) return '****';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
```

### 12.2 환경변수 검증 (시작 시 필수값 확인)

### 12.3 LLM 프롬프트 시크릿 노출 방지

```typescript
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,       // OpenAI
  /sk-ant-[a-zA-Z0-9]{20,}/,   // Claude
  /ghp_[a-zA-Z0-9]{36}/,       // GitHub PAT
];

function validatePromptSafety(prompt: string): boolean {
  return !SECRET_PATTERNS.some(p => p.test(prompt));
}
```

---

## 13. 체크리스트

### Sprint 0 (완료)

- [x] `.env.example` 파일 생성 (루트, 각 서비스별)
- [x] `docker-compose.yml` 평문 비밀번호 → `.env` 참조로 변경
- [x] `.gitignore` 누락 패턴 추가 (`*.pem`, `*.key`, `secrets/`)

> **현재 알려진 이슈**: `helm/game-server/values.yaml`에 `JWT_SECRET: "test-secret-for-dev"`가 하드코딩되어 있다. K8s Secret 주입 방식으로 전환이 필요하며, Phase 2~3 체크리스트에서 처리한다.

### Phase 2~3

- [ ] 환경변수 검증 로직 구현
- [ ] 로그 마스킹 유틸리티 구현
- [ ] K8s Secret 리소스 생성
- [ ] Sealed Secrets 도입

### Phase 5

- [ ] cert-manager 설치
- [ ] HashiCorp Vault 도입 검토
- [ ] K8s Audit Policy 적용

---

## 14. 관련 문서

| 문서 | 위치 | 관련 내용 |
|------|------|----------|
| 시스템 아키텍처 | `docs/02-design/01-architecture.md` | 인증/인가 아키텍처 |
| 도구 체인 | `docs/01-planning/04-tool-chain.md` | Vault/Cert-Manager 계획 |
| 게이트웨이 구축 | `docs/05-deployment/02-gateway-architecture.md` | TLS 설정 |
| 개발 환경 셋업 | `docs/03-development/01-dev-setup.md` | MCP, PostgreSQL 접속 |

> **문서 이력**: v1.0 / 2026-03-12 / Security Engineer (Claude) / 초안 작성
