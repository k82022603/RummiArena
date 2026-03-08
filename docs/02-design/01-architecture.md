# 시스템 아키텍처 설계 (System Architecture)

## 1. 전체 아키텍처 개요

```
┌─────────────────────────────────────────────────────┐
│                    Istio Ingress Gateway             │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
    ┌──────▼──────┐           ┌───────▼───────┐
    │  Frontend   │           │  Admin Panel  │
    │  (Next.js)  │           │  (Next.js)    │
    └──────┬──────┘           └───────┬───────┘
           │ WebSocket / REST          │ REST
           │                          │
    ┌──────▼──────────────────────────▼───────┐
    │            Game Server (API)            │
    │         WebSocket + REST API            │
    │         ┌─────────────────┐             │
    │         │  Game Engine    │             │
    │         │  (규칙 검증)     │             │
    │         └─────────────────┘             │
    └──┬─────────┬─────────────┬─────────────┘
       │         │             │
  ┌────▼───┐ ┌───▼────┐ ┌─────▼──────┐
  │ Redis  │ │Postgres│ │ AI Adapter │
  │(상태)  │ │(영속)  │ │  Service   │
  └────────┘ └────────┘ └─────┬──────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────▼──┐    ┌───────▼──┐    ┌────────▼──┐
       │ OpenAI  │    │  Claude  │    │  Ollama   │
       │DeepSeek │    │   API    │    │  (Local)  │
       └─────────┘    └──────────┘    └───────────┘
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

### 3.2 LLM 신뢰 금지 원칙
```
LLM → "행동 제안" (JSON)
Game Engine → "유효성 검증"
  ├─ 유효 → 적용
  └─ 무효 → 재요청 (최대 3회) → 실패 시 강제 드로우
```

### 3.3 AI Adapter 분리
- Game Engine은 특정 LLM에 의존하지 않음
- 공통 인터페이스를 통해 모델 교체 가능
- Istio VirtualService로 모델별 트래픽 분배 가능

### 3.4 이벤트 기반 턴 관리
```
턴 시작
  → Human: WebSocket으로 행동 수신
  → AI: AI Adapter에 행동 요청
    → 유효성 검증
      → 턴 종료 이벤트 발행
        → 다음 플레이어 턴 시작
```

## 4. 데이터 흐름

### 4.1 Human 플레이어 턴
```
Browser → WebSocket → Game Server → Engine 검증 → Redis 상태 업데이트
  → 전체 플레이어에게 WebSocket 브로드캐스트
```

### 4.2 AI 플레이어 턴
```
Game Server → AI Adapter → LLM API 호출 → 응답 파싱
  → Engine 검증 → Redis 상태 업데이트
  → 전체 플레이어에게 WebSocket 브로드캐스트
```

## 5. 인증/인가 아키텍처

```
Browser → Google OAuth 2.0 → JWT 발급
  → WebSocket 연결 시 JWT 검증
  → API 호출 시 JWT 검증
  → RBAC: ROLE_ADMIN / ROLE_USER
```

## 6. Kubernetes 배포 아키텍처

```
Namespace: rummikub

Deployments:
  ├─ frontend (replicas: 1)
  ├─ game-server (replicas: 1)
  ├─ ai-adapter (replicas: 1)
  ├─ admin (replicas: 1)
  └─ ollama (replicas: 1)

StatefulSets:
  ├─ redis (replicas: 1)
  └─ postgres (replicas: 1, PVC)

Services:
  ├─ frontend (ClusterIP)
  ├─ game-server (ClusterIP)
  ├─ ai-adapter (ClusterIP)
  ├─ admin (ClusterIP)
  ├─ redis (ClusterIP)
  └─ postgres (ClusterIP)

Ingress:
  ├─ / → frontend
  ├─ /api → game-server
  ├─ /ws → game-server (WebSocket)
  └─ /admin → admin

Istio (Phase 2):
  ├─ VirtualService (라우팅 룰)
  ├─ DestinationRule (Circuit Breaker, Timeout)
  └─ PeerAuthentication (mTLS)
```

## 7. 외부 시스템 연동

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Google     │     │ Kakao        │     │ LLM APIs     │
│  OAuth 2.0  │     │ Message API  │     │ (External)   │
└──────┬──────┘     └──────┬───────┘     └──────┬───────┘
       │                   │                    │
       │    HTTPS          │    HTTPS           │    HTTPS
       │                   │                    │
┌──────▼───────────────────▼────────────────────▼──────┐
│                    Game Server                        │
└──────────────────────────────────────────────────────┘
```
