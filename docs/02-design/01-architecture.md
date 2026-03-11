# 시스템 아키텍처 설계 (System Architecture)

## 1. 전체 아키텍처 개요

```mermaid
graph TB
    Ingress["Istio Ingress Gateway"]
    Ingress --> FE["Frontend\n(Next.js)"]
    Ingress --> Admin["Admin Panel\n(Next.js)"]
    FE -->|"WebSocket / REST"| GS
    Admin -->|"REST"| GS

    subgraph GS["Game Server (API)"]
        direction TB
        API["WebSocket + REST API"]
        Engine["Game Engine\n(규칙 검증)"]
    end

    GS --> Redis["Redis\n(상태)"]
    GS --> PG["PostgreSQL\n(영속)"]
    GS --> AI["AI Adapter\nService"]
    AI --> OpenAI["OpenAI\nDeepSeek"]
    AI --> Claude["Claude\nAPI"]
    AI --> Ollama["Ollama\n(Local)"]
```

## 2. 서비스 구성

| 서비스 | 역할 | 포트 | 기술 |
|--------|------|------|------|
| frontend | 게임 UI | 3000 | Next.js |
| game-server | 게임 로직, API, WebSocket | 8080 | NestJS or Go |
| ai-adapter | LLM 호출 추상화 | 8081 | NestJS or Go |
| admin | 관리자 대시보드 | 3001 | Next.js |
| redis | 게임 상태 캐시 | 6379 | Redis 7 |
| postgres | 유저, 전적, 로그 영속 저장 | 5432 | PostgreSQL 16 |
| ollama | 로컬 LLM 서빙 | 11434 | Ollama |

## 3. 핵심 설계 원칙

### 3.1 Stateless Game Server
- 게임 상태는 Redis에 저장
- Pod 재시작 시에도 게임 유지
- 수평 확장 가능
- **수평 확장 시 WebSocket 전략**: 현재 replicas:1이므로 단일 인스턴스에서 모든 WebSocket 연결을 처리한다. 수평 확장(replicas > 1) 시에는 Redis Pub/Sub 기반 메시지 브로커를 도입하여 인스턴스 간 WebSocket 이벤트를 동기화해야 한다.

```mermaid
flowchart LR
    C1["Client A"] --> P1["Pod 1\n(Game Server)"]
    C2["Client B"] --> P2["Pod 2\n(Game Server)"]
    P1 -->|Publish| RPS["Redis Pub/Sub\n(이벤트 브로커)"]
    P2 -->|Subscribe| RPS
    RPS -->|Subscribe| P1
    RPS -->|Publish| P2
```

### 3.2 LLM 신뢰 금지 원칙
```mermaid
flowchart LR
    LLM["LLM"] -->|"행동 제안 (JSON)"| Engine["Game Engine\n유효성 검증"]
    Engine -->|유효| Apply["적용"]
    Engine -->|무효| Retry["재요청\n(최대 3회)"]
    Retry -->|실패| Draw["강제 드로우"]
```

### 3.3 AI Adapter 분리
- Game Engine은 특정 LLM에 의존하지 않음
- 공통 인터페이스를 통해 모델 교체 가능
- Istio VirtualService로 모델별 트래픽 분배 가능

### 3.4 이벤트 기반 턴 관리
```mermaid
flowchart TB
    Start["턴 시작"] --> Human["Human: WebSocket으로\n행동 수신"]
    Start --> AI["AI: AI Adapter에\n행동 요청"]
    Human --> Validate["유효성 검증"]
    AI --> Validate
    Validate --> End["턴 종료 이벤트 발행"]
    End --> Next["다음 플레이어 턴 시작"]
```

## 4. 데이터 흐름

### 4.1 Human 플레이어 턴
```mermaid
flowchart LR
    A["Browser"] --> B["WebSocket"] --> C["Game Server"] --> D["Engine 검증"] --> E["Redis 상태\n업데이트"] --> F["전체 플레이어에게\nWebSocket 브로드캐스트"]
```

### 4.2 AI 플레이어 턴
```mermaid
flowchart LR
    A["Game Server"] --> B["AI Adapter"] --> C["LLM API 호출"] --> D["응답 파싱"]
    D --> E["Engine 검증"] --> F["Redis 상태\n업데이트"] --> G["전체 플레이어에게\nWebSocket 브로드캐스트"]
```

## 5. 인증/인가 아키텍처

```mermaid
flowchart LR
    Browser --> OAuth["Google OAuth 2.0"] --> JWT["JWT 발급"]
    JWT --> WS["WebSocket 연결 시\nJWT 검증"]
    JWT --> API["API 호출 시\nJWT 검증"]
    WS --> RBAC["RBAC:\nADMIN / USER"]
    API --> RBAC
```

## 6. Kubernetes 배포 아키텍처

```mermaid
graph TB
    subgraph NS["Namespace: rummikub"]
        subgraph deploy["Deployments (replicas: 1)"]
            d1["frontend"]
            d2["game-server"]
            d3["ai-adapter"]
            d4["admin"]
            d5["ollama"]
        end
        subgraph sts["StatefulSets"]
            s1["redis (1)"]
            s2["postgres (1, PVC)"]
        end
        subgraph svc["Services (ClusterIP)"]
            sv1["frontend"]
            sv2["game-server"]
            sv3["ai-adapter"]
            sv4["admin"]
            sv5["redis"]
            sv6["postgres"]
        end
    end
    subgraph ing["Ingress (NGINX)"]
        i0["TLS 종단 (self-signed cert)\nHTTPS → HTTP 프록시"]
        i1["/ → frontend"]
        i2["/api → game-server"]
        i3["/ws → game-server (WS Upgrade)"]
        i4["/admin → admin"]
    end
    subgraph istio["Istio (Phase 5, Sprint 8~9)"]
        is1["VirtualService (라우팅)"]
        is2["DestinationRule (CB, Timeout)"]
        is3["PeerAuthentication (mTLS)"]
    end
    ing --> NS
    istio -.->|"Phase 5"| NS
```

## 7. 외부 시스템 연동

```mermaid
graph TB
    Google["Google\nOAuth 2.0"] -->|HTTPS| GS["Game Server\n(게임 서버)"]
    Kakao["Kakao\nMessage API"] -->|HTTPS| GS
    GS -->|gRPC/REST| AIA["AI Adapter\n(AI 어댑터)"]
    AIA -->|HTTPS| LLM["LLM APIs\n(OpenAI, Claude, DeepSeek)"]
    AIA -->|HTTP| Ollama["Ollama\n(로컬 LLM)"]
```

> **참고**: LLM API 호출은 Game Server가 직접 수행하지 않는다. 반드시 AI Adapter를 경유하여 모델 무관 인터페이스로 통신한다.

## 8. 게임 상태 Enum

모든 서비스에서 동일한 게임 상태 값을 사용한다.

| 상태 | 설명 |
|------|------|
| WAITING | Room 생성 후 플레이어 입장 대기 |
| PLAYING | 게임 진행 중 |
| FINISHED | 정상 종료 (승자 확정) |
| CANCELLED | 비정상 종료 (강제 종료, 인원 부족) |

> CREATED 상태는 사용하지 않는다. Room 생성 시 즉시 WAITING 상태로 진입한다.
