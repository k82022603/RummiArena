# Mermaid Diagrams

Mermaid를 사용한 다이어그램 작성 표준을 정의합니다.

## Purpose

문서 내 다이어그램을 일관된 형식으로 작성하여 가독성과 유지보수성을 높입니다.

---

## Diagram Type Selection (다이어그램 유형 선택)

| 상황 | Mermaid 유형 | 예시 |
|------|-------------|------|
| 순차적 흐름 | `flowchart LR` | A → B → C |
| 계층적 흐름 | `flowchart TB` | 상위에서 하위로 |
| 시스템 간 통신 | `sequenceDiagram` | API 호출, 인증 플로우 |
| 일정/타임라인 | `gantt` | 스프린트 계획, 테스트 일정 |
| 상태 변화 | `stateDiagram-v2` | 주문 상태, 문서 상태 |
| 클래스 관계 | `classDiagram` | 도메인 모델, 엔티티 관계 |
| ER 다이어그램 | `erDiagram` | 데이터베이스 스키마 |
| 컴포넌트 그룹핑 | `subgraph` | 레이어별 서비스 분류 |

---

## ⚠️ GitHub 렌더링 주의사항 (Breaking Rules)

GitHub의 Mermaid 렌더러는 표준 Mermaid와 미묘하게 다르다. 아래 규칙을 반드시 지킨다.

| 규칙 | 잘못된 예 | 올바른 예 |
|------|-----------|-----------|
| **gantt 작업명에 `:` 금지** | `Sprint 1: 게임 엔진  :s1, ...` | `Sprint 1 게임 엔진  :s1, ...` |
| **flowchart edge label에 `\n` 금지** | `A -->|시작\n완료| B` | `A -->|시작 완료| B` |
| **gitGraph 대소문자** | ` ```mermaid\ngitgraph` | ` ```mermaid\ngitGraph` |
| **sequenceDiagram 메시지에 `;` 금지** | `A->>B: SELECT * WHERE id='x';` | `A->>B: SELECT * WHERE id=x` |
| **sequenceDiagram 메시지에 `'` 주의** | `A->>B: WHERE id='abc'` | `A->>B: WHERE id=abc` |

> **gantt 작업명 규칙 상세**: `gantt`에서 첫 번째 `:`는 작업명과 속성(status/id/날짜)의 구분자이다.
> 작업명 안에 `:`를 쓰면 파싱 오류가 발생한다. 공백 또는 ` -`로 대체할 것.

> **`\n` 제한 상세**: `\n`은 노드 라벨(`A["줄1\n줄2"]`) 안에서는 사용 가능하나,
> 엣지 라벨(`|텍스트|`) 안에서는 불가하다.

---

## Flowchart Patterns

### 기본 플로우차트

```mermaid
flowchart LR
    A["시작"] --> B["처리"]
    B --> C{"조건"}
    C -->|Yes| D["결과 A"]
    C -->|No| E["결과 B"]
```

### 시스템 아키텍처 (레이어 분리)

```mermaid
flowchart TB
    subgraph Frontend["Frontend Layer"]
        UI["React UI"]
        State["Redux Store"]
    end

    subgraph Gateway["API Gateway"]
        GW["Spring Cloud Gateway"]
        Auth["Auth Filter"]
    end

    subgraph Backend["Backend Services"]
        API["FastAPI"]
        RAG["RAG Pipeline"]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL)]
        ES[(Elasticsearch)]
        Neo[(Neo4j)]
    end

    UI --> GW
    GW --> Auth
    Auth --> API
    API --> RAG
    RAG --> PG & ES & Neo
```

### VIP 3단계 아키텍처

```mermaid
flowchart TB
    subgraph Value["Value Layer"]
        V1["Vector Search"]
        V2["Graph Search"]
        V3["Keyword Search"]
    end

    subgraph Intelligent["Intelligent Layer"]
        I1["Reranker"]
        I2["Fusion"]
        I3["Context Window"]
    end

    subgraph Planning["Planning Layer"]
        P1["Query Planning"]
        P2["Response Synthesis"]
        P3["Quality Check"]
    end

    Value --> Intelligent --> Planning
```

---

## Sequence Diagram Patterns

### API 호출 플로우

```mermaid
sequenceDiagram
    actor User
    participant UI as Frontend
    participant GW as API Gateway
    participant API as Backend API
    participant DB as Database

    User->>UI: 검색 요청
    UI->>GW: POST /api/v1/search
    GW->>GW: JWT 검증
    GW->>API: Forward Request
    API->>DB: Query
    DB-->>API: Results
    API-->>GW: Response
    GW-->>UI: JSON Response
    UI-->>User: 검색 결과 표시
```

### 인증 플로우

```mermaid
sequenceDiagram
    actor User
    participant App as Application
    participant KC as Keycloak
    participant API as Backend

    User->>App: 로그인 요청
    App->>KC: Authorization Request
    KC->>User: 로그인 페이지
    User->>KC: 자격 증명 입력
    KC-->>App: Authorization Code
    App->>KC: Token Request
    KC-->>App: Access Token + Refresh Token
    App->>API: API 요청 (Bearer Token)
    API->>KC: Token Validation
    KC-->>API: Token Valid
    API-->>App: Response
```

---

## State Diagram Patterns

### 문서 처리 상태

```mermaid
stateDiagram-v2
    [*] --> Uploaded: 문서 업로드

    Uploaded --> Processing: 처리 시작
    Processing --> Chunking: 청킹
    Chunking --> Embedding: 임베딩 생성
    Embedding --> Indexing: 인덱싱
    Indexing --> Completed: 완료

    Processing --> Failed: 오류 발생
    Chunking --> Failed: 오류 발생
    Embedding --> Failed: 오류 발생
    Indexing --> Failed: 오류 발생

    Failed --> Processing: 재시도
    Completed --> [*]
```

---

## Class Diagram Patterns

### 도메인 모델

```mermaid
classDiagram
    class Document {
        +String id
        +String title
        +String content
        +DocumentType type
        +DateTime createdAt
        +process()
        +index()
    }

    class Chunk {
        +String id
        +String content
        +int position
        +float[] embedding
    }

    class SearchResult {
        +List~Document~ documents
        +List~float~ scores
        +int totalCount
    }

    Document "1" --> "*" Chunk: contains
    SearchResult "*" --> "*" Document: references
```

---

## ER Diagram Patterns

### 데이터베이스 스키마

```mermaid
erDiagram
    DOCUMENT ||--o{ CHUNK : contains
    DOCUMENT {
        uuid id PK
        string title
        string content
        string type
        timestamp created_at
    }

    CHUNK {
        uuid id PK
        uuid document_id FK
        string content
        int position
        vector embedding
    }

    USER ||--o{ SEARCH_HISTORY : has
    USER {
        uuid id PK
        string email
        string name
    }

    SEARCH_HISTORY {
        uuid id PK
        uuid user_id FK
        string query
        timestamp searched_at
    }
```

---

## Gantt Chart Patterns

### 스프린트 계획

```mermaid
gantt
    title Sprint 01 계획
    dateFormat YYYY-MM-DD
    section 설계
        API 설계           :done, des1, 2026-01-20, 2d
        DB 스키마 설계      :done, des2, 2026-01-20, 2d
    section 개발
        Backend 구현       :active, dev1, 2026-01-22, 5d
        Frontend 구현      :dev2, after dev1, 3d
    section 테스트
        단위 테스트        :test1, after dev2, 2d
        통합 테스트        :test2, after test1, 2d
```

---

## Style Guidelines

### 노드 스타일링

```mermaid
flowchart LR
    A["기본 노드"]
    B(["둥근 노드"])
    C[("데이터베이스")]
    D{{"조건"}}
    E[/"입력"/]
    F[\"출력"\]

    style A fill:#e1f5fe
    style B fill:#c8e6c9
    style C fill:#fff3e0
```

### 색상 팔레트 (권장)

| 용도 | 색상 코드 | 예시 |
|------|----------|------|
| Frontend | `#e1f5fe` | 연한 파랑 |
| Backend | `#c8e6c9` | 연한 초록 |
| Database | `#fff3e0` | 연한 주황 |
| Gateway | `#f3e5f5` | 연한 보라 |
| Error | `#ffcdd2` | 연한 빨강 |
| Success | `#c8e6c9` | 연한 초록 |

---

## Anti-Patterns (피해야 할 패턴)

### 🚫 피해야 할 것

1. **ASCII 아트 사용**
   ```
   ❌ +---+    +---+
      | A | -> | B |
      +---+    +---+
   ```

2. **너무 복잡한 단일 다이어그램**
   - 노드 20개 이상 → 분리 권장

3. **설명 없는 노드**
   - `A --> B` 대신 `A["검색 요청"] --> B["결과 처리"]`

4. **한글 레이블 누락**
   - 모든 노드에 한글 설명 포함

---

## Quick Reference

### 노드 형태

```
A["사각형"]
B("둥근 사각형")
C(("원"))
D{{"육각형"}}
E[("데이터베이스")]
F{{"조건"}}
```

### 화살표

```
A --> B     실선 화살표
A --- B     실선
A -.-> B    점선 화살표
A ==> B     굵은 화살표
A --text--> B  텍스트 포함
```

### 방향

```
flowchart LR  (왼쪽→오른쪽)
flowchart TB  (위→아래)
flowchart BT  (아래→위)
flowchart RL  (오른쪽→왼쪽)
```

---

**Version**: 1.0.0
**Last Updated**: 2026-01-24
