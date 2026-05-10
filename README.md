# RummiArena

루미큐브(Rummikub) 보드게임 기반 **멀티 LLM 전략 실험 플랫폼**.
Human + AI 혼합 2~4인 실시간 대전을 지원하며, GPT / Claude / DeepSeek / Ollama 등 다양한 LLM의 게임 전략을 비교·분석한다.

> **🏁 프로젝트 종료 — 2026-05-10**
> Sprint 1~7 + 핫픽스 완료 · Jest 659 tests · Go 770 tests · AI Adapter 637 tests · CI/CD 17/17 ALL GREEN

## Highlights

- **4종 LLM 실시간 대전** — OpenAI gpt-5-mini (33.3%), DeepSeek V4-Pro (31.9%), Ollama qwen2.5:3b (25.6%), Claude Sonnet 4 (20.0%)
- **LLM 신뢰 금지 아키텍처** — LLM은 수를 "제안"만 하고, Game Engine이 규칙 검증. 무효 → 재요청(3회) → 강제 드로우
- **AI 캐릭터 시스템** — 6종 페르소나 × 3단계 난이도 × 심리전 레벨(0~3)
- **ELO 랭킹** — Redis Sorted Set 기반 6티어, 실시간 순위
- **DevSecOps** — GitLab CI 17스테이지, SonarQube, Trivy, Rate Limiting
- **게임룰 SSOT** — 77개 룰(V-*/UR-* 코드), 게임 분석가 검증, 룰 기반 로직만 허용

## Architecture

```mermaid
graph LR
    FE["Frontend\n(Next.js)"] --> GS["Game Server\n(Go/gin)"]
    GS --> Engine["Game Engine\n(규칙 검증)"]
    GS --> AI["AI Adapter\n(NestJS)"] --> LLM["LLM APIs\nOpenAI / Claude\nDeepSeek / Ollama"]
    GS --> Redis["Redis\n(게임 상태 + ELO)"]
    GS --> PG["PostgreSQL\n(영속 데이터)"]
    Admin["Admin Panel\n(Next.js)"] -->|관리 API| GS
```

### Core Design Principles

| 원칙 | 설명 |
|------|------|
| **LLM 신뢰 금지** | LLM 응답은 항상 Game Engine으로 유효성 검증 |
| **AI Adapter 분리** | 공통 인터페이스(`MoveRequest`/`MoveResponse`)로 모델 무관 교체 |
| **Stateless 서버** | 모든 게임 상태는 Redis에 저장, Pod 재시작에도 게임 유지 |
| **GitOps** | ArgoCD + Helm chart 기반 선언적 배포 |
| **DevSecOps** | CI 파이프라인에 SonarQube + Trivy 보안 게이트 |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TailwindCSS, Framer Motion, dnd-kit, Zustand |
| Backend (game-server) | Go 1.24, gin, gorilla/websocket, GORM, zap |
| Backend (ai-adapter) | NestJS, TypeScript, class-validator, @nestjs/throttler |
| Database | PostgreSQL 16, Redis 7 |
| AI Models | OpenAI API (gpt-5-mini), Claude API (Sonnet 4), DeepSeek API (V4-Pro thinking), Ollama (qwen2.5:3b) |
| Auth | Google OAuth 2.0 (NextAuth.js) |
| Infra | Docker Desktop Kubernetes, Helm 3, ArgoCD, Traefik v3 |
| CI/CD | GitLab CI + GitLab Runner (Kaniko build) |
| Quality | SonarQube, Trivy, OWASP ZAP |
| Notification | KakaoTalk API |

## Project Structure

```
docs/
  00-tools/        # 도구 체인 매뉴얼 (26개)
  01-planning/     # 기획 (헌장, 요구사항, WBS, 스프린트 백로그)
  02-design/       # 설계 (아키텍처, DB, API, WebSocket, AI, 보안)
  03-development/  # 개발 가이드 (셋업, 코딩 컨벤션, CI/CD)
  04-testing/      # 테스트 전략 + 보고서
  05-deployment/   # 배포 가이드 + K8s 아키텍처
  06-operations/   # 운영 가이드
src/
  game-server/     # Go backend — REST API + Game Engine + WebSocket
  ai-adapter/      # NestJS — LLM 통합 어댑터
  frontend/        # Next.js — 게임 UI
  admin/           # Next.js — 관리자 대시보드
helm/              # Helm charts (7개: postgres, redis, game-server,
                   #   ai-adapter, frontend, admin, ollama)
argocd/            # ArgoCD application manifests
scripts/           # 자동화 스크립트 (시크릿 주입, 통합 테스트)
work_logs/         # 세션/데일리/스크럼/바이브/회고 로그
.github/           # GitHub Issues templates, workflows
```

## Quick Start

### Prerequisites

- Docker Desktop with Kubernetes enabled
- Helm 3, Node.js 20+, Go 1.24+
- API Keys: OpenAI / Anthropic / DeepSeek (선택)

### K8s Deployment

```bash
# 네임스페이스 생성
kubectl create namespace rummikub

# Helm 배포 (7개 서비스)
cd helm
helm install postgres charts/postgres -n rummikub
helm install redis charts/redis -n rummikub
helm install game-server charts/game-server -n rummikub
helm install ai-adapter charts/ai-adapter -n rummikub
helm install frontend charts/frontend -n rummikub
helm install admin charts/admin -n rummikub
helm install ollama charts/ollama -n rummikub

# 시크릿 주입 (Google OAuth, API Keys)
cd ../scripts
./inject-secrets.sh
```

### Service Endpoints (NodePort)

| Service | URL | Port |
|---------|-----|------|
| Frontend | http://localhost:30000 | 30000 |
| Admin Dashboard | http://localhost:30001 | 30001 |
| Game Server | http://localhost:30080 | 30080 |
| AI Adapter | http://localhost:30081 | 30081 |
| PostgreSQL | localhost:30432 | 30432 |

### Local Development

```bash
# game-server
cd src/game-server && go build ./cmd/server && ./server

# ai-adapter
cd src/ai-adapter && npm install && npm run start:dev

# frontend
cd src/frontend && npm install && npm run dev

# admin
cd src/admin && npm install && npm run dev
```

## API Overview

### Authentication
```
POST /api/auth/google         # Google OAuth authorization code
POST /api/auth/google/token   # Google id_token (NextAuth.js)
POST /api/auth/dev-login      # Development-only login
```

### Room Management
```
POST   /api/rooms             # 방 생성
GET    /api/rooms             # 방 목록
GET    /api/rooms/:id         # 방 상세
POST   /api/rooms/:id/join   # 입장
POST   /api/rooms/:id/leave  # 퇴장
POST   /api/rooms/:id/start  # 게임 시작
DELETE /api/rooms/:id         # 방 삭제
```

### Game Actions
```
GET    /api/games/:id         # 게임 상태 (1인칭 뷰)
POST   /api/games/:id/place  # 타일 임시 배치
POST   /api/games/:id/confirm# 턴 확정 (엔진 검증)
POST   /api/games/:id/draw   # 타일 드로우
POST   /api/games/:id/reset  # 턴 되돌리기
```

### Rankings & ELO
```
GET    /api/rankings                  # 전체 랭킹
GET    /api/rankings/tier/:tier       # 티어별 랭킹
GET    /api/users/:id/rating          # ELO 레이팅 (공개)
GET    /api/users/:id/rating/history  # 레이팅 이력 (인증 필요)
```

### Practice Mode
```
POST   /api/practice/progress  # 연습 진행 저장
GET    /api/practice/progress  # 연습 진행 조회
```

### Admin
```
GET    /admin/dashboard            # 대시보드
GET    /admin/games                # 게임 목록
GET    /admin/games/:id            # 게임 상세
GET    /admin/users                # 사용자 목록
GET    /admin/stats/ai             # AI 성능 통계
GET    /admin/stats/elo            # ELO 분포 통계
GET    /admin/stats/performance    # 퍼포먼스 메트릭
```

### WebSocket
```
GET    /ws                    # WebSocket 연결
```

**메시지 타입**: `AUTH` → `AUTH_OK` → `GAME_STATE` / `TURN_START` / `TURN_ACTION` / `GAME_OVER` / `ERROR`
**Heartbeat**: `PING`/`PONG` (30s interval)

### Health Check
```
GET    /health                # 서버 상태 + Redis 연결
GET    /ready                 # 준비 상태
```

## Tile Encoding

타일 코드: `{Color}{Number}{Set}`

| 요소 | 값 | 예시 |
|------|-----|------|
| Color | R(Red), B(Blue), Y(Yellow), K(Black) | `R7a` = 빨강 7 세트a |
| Number | 1~13 | `B13b` = 파랑 13 세트b |
| Set | a / b (동일 타일 구분) | |
| Joker | JK1, JK2 | |

## AI Character System

| Character | 스타일 | 설명 |
|-----------|--------|------|
| Rookie | 보수적 | 안전한 수만 선택 |
| Calculator | 확률 기반 | 기대값 계산으로 최적 수 |
| Shark | 공격적 | 상대 견제 + 대량 배치 |
| Fox | 기만적 | 의도적 지연 + 역전 |
| Wall | 수비적 | 최소 배치 + 자원 비축 |
| Wildcard | 예측 불가 | 랜덤 전략 혼합 |

- **난이도**: 하수 / 중수 / 고수
- **심리전 레벨**: 0 (없음) ~ 3 (고급 블러프)
- **추론 모델 필수**: 비추론 모델은 타일 조합 탐색에 부적합 (실험 검증)

## AI Battle Results

### 최종 모델별 Place Rate (2026-05-10 기준)

| Model | Place Rate | 프롬프트 | 비용/게임 | 비고 |
|-------|-----------|---------|-----------|------|
| **GPT-5-mini** | **33.3%** | v2 | $0.15 | 3모델 공통 표준 v2 확정 |
| **DeepSeek V4-Pro** (thinking) | **31.9%** | v2 | $0.039 | N=3, avg 102s, fallback 0 |
| **Ollama qwen2.5:3b** | **25.6%** | v9-ollama-place | $0 | N=3 평균, v8(15.8%)→+9.8%p |
| **Claude Sonnet 4** (thinking) | **20.0%** | v2 | $1.11 | WS_TIMEOUT, 역대 최고 33.3% |

> 전 모델 Fallback 0건 달성. 비용 대비: DeepSeek이 Claude 대비 28배 효율.

### LLM 실험 여정 요약

| 시기 | 실험 | 핵심 발견 |
|------|------|----------|
| Sprint 3 | Ollama 통합 | CPU 추론 가능, 단 응답 25초 |
| Sprint 4 | DeepSeek Round 2 | 5% → 23.1%, 프롬프트가 성능 결정 |
| Sprint 5 | v2 프롬프트 표준화 | DeepSeek 30.8% 달성, 3모델 공통화 |
| Sprint 7 | DeepSeek V4-Pro thinking | 31.9%, V4-Flash 전 모드 탈락 |
| 핫픽스 | v8/v9-ollama-place | LLaMA 0% → 15.8% → 25.6% |

> 상세 분석: `docs/04-testing/109-v9-ollama-place-experiment-2026-05-09.md`

## Test Status

| Category | Tests | Status |
|----------|-------|--------|
| Game Engine (Go) | 770 | PASS |
| AI Adapter (NestJS) | 637 | PASS |
| Frontend Jest | 659 | PASS |
| Playwright E2E | 375 | PASS |
| WS Multiplayer | 16 | PASS |
| WS Integration | 5 | PASS |
| **Total** | **2,462** | **ALL PASS** |

### CI/CD Pipeline (17/17 Stages)

```
lint (4) → test (2) → quality (2) → build (4) → scan (4) → gitops (1)
```

- **Build**: Kaniko (DinD 폐기)
- **Quality**: SonarQube 정적 분석
- **Security**: Trivy 이미지 스캔
- **Deploy**: ArgoCD GitOps 자동 배포

## Security

| Feature | Implementation |
|---------|---------------|
| Authentication | Google OAuth 2.0 (id_token + authorization code) |
| Rate Limiting (REST) | Redis Sliding Window Counter (10~60 req/min) |
| Rate Limiting (WS) | In-memory Fixed Window (60 msg/min) |
| AI Cost Control | Daily $20 한도 + 시간당 사용자 제한 |
| LLM Validation | Game Engine 3-retry fallback |
| Image Scanning | Trivy CVE 스캔 (CI/CD 통합) |
| Static Analysis | SonarQube Quality Gate |

## Documentation

### Planning
- [Project Charter](docs/01-planning/01-project-charter.md)
- [Requirements](docs/01-planning/02-requirements.md)
- [Sprint Backlogs](docs/01-planning/) (Sprint 1~5)

### Design
- [Architecture](docs/02-design/01-architecture.md)
- [Database Design](docs/02-design/02-database-design.md)
- [API Design](docs/02-design/03-api-design.md)
- [AI Adapter Design](docs/02-design/04-ai-adapter-design.md)
- [Game Rules](docs/02-design/06-game-rules.md)
- [WebSocket Protocol](docs/02-design/10-websocket-protocol.md)
- [Rate Limit Design](docs/02-design/14-rate-limit-design.md)
- [Model Prompt Policy](docs/02-design/18-model-prompt-policy.md)

### Testing
- [Test Strategy](docs/04-testing/01-test-strategy.md)
- [LLM Model Comparison](docs/04-testing/23-llm-model-comparison.md)
- [AI vs AI Tournament](docs/04-testing/22-ai-vs-ai-tournament.md)

### Deployment
- [K8s Architecture](docs/05-deployment/02-k8s-architecture.md)
- [Deployment Guide](docs/05-deployment/01-deployment-guide.md)

### Closure & Operations
- [Project Closure Report](docs/07-closure/01-project-closure-report.md)
- [Operation Handover Plan](docs/07-closure/02-operation-handover-plan.md)
- [Operator Manual](docs/06-operations/10-operator-manual.md)
- [User Manual](docs/06-operations/11-user-manual.md)
- [Production Environment Guide](docs/06-operations/12-production-environment-guide.md)
- [Final Retrospectives](work_logs/retrospectives/final-2026-05-10/)

## Sprint Progress

| Sprint | Period | Key Deliverables |
|--------|--------|-----------------|
| Sprint 1 | 03-13~21 | Game Engine, REST API, WebSocket, K8s 5서비스, CI/CD 기반 |
| Sprint 2 | 03-22~28 | AI 캐릭터 6종, Turn Orchestrator, ELO 랭킹, Admin, 연습 모드 |
| Sprint 3 | 03-29~04-04 | Google OAuth K8s, WS 재연결, Ollama 통합, Redis Timer/Session |
| Sprint 4 | 04-05~11 | 플레이어 생명주기, AI 비용 메트릭, 보안 P0, AI Round 2 (DeepSeek 23.1%) |
| Sprint 5 | 04-12~18 | Rate Limiting, DeepSeek 30%+, CI/CD 17/17 ALL GREEN, 플레이테스트 88.6% |
| Sprint 6 | 04-19~21 | 재배치 UI 4유형(dnd-kit), Agent Teams 13명 체제, 핫픽스 4건 |
| Sprint 7 | 04-22~29 | UI State 아키텍처 통합, pendingStore SSOT, 게임룰 77개, BUG-CONFIRM-001 |
| **핫픽스** | **05-01~10** | **v8/v9-ollama-place (LLaMA 0%→25.6%), joker 파이프라인 패치, ELO API 연동** |

**750+ commits** · 110+ 설계 문서 · 2,462 tests · **프로젝트 종료 2026-05-10**

## License

This project is for educational and research purposes.
