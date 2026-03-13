# Claude Code (Skills / MCP) 매뉴얼

## 1. 개요
AI 개발 어시스턴트. Skills와 MCP 서버를 통해 프로젝트 도구와 직접 연동.
이 프로젝트에서는 코드 리뷰, 문서 생성, 보안 스캔, GitHub 연동, 프로젝트 로그 관리 등에 활용.

## 2. 사용 가능한 Skills

### 도구 (Tools) — 13개
| 커맨드 | 용도 |
|--------|------|
| `/tools:security-scan` | OWASP Top 10 보안 취약점 스캔 |
| `/tools:deps-audit` | 의존성 보안 감사 및 업데이트 권장 |
| `/tools:doc-generate` | API 및 코드 문서 자동 생성 |
| `/tools:code-explain` | 코드 설명 및 문서화 생성 |
| `/tools:debug-trace` | 디버깅 추적 및 근본 원인 분석 |
| `/tools:refactor-clean` | 리팩토링 및 클린 코드 적용 |
| `/tools:error-analysis` | 에러 분석 및 해결책 제시 |
| `/tools:ai-review` | AI/ML 코드 리뷰 (LLM, Vector DB, RAG) |
| `/tools:tech-debt` | 기술 부채 분석 및 개선 계획 |
| `/tools:context-save` | 프로젝트 컨텍스트 저장 |
| `/tools:context-restore` | 저장된 프로젝트 컨텍스트 복원 |
| `/tools:pr-enhance` | PR 품질 개선 및 리뷰 준비 |
| `/tools:issue` | GitHub 이슈 분석 및 수정 |

### 워크플로우 (Workflows) — 6개
| 커맨드 | 용도 |
|--------|------|
| `/workflows:feature-development` | 기능 개발 전체 사이클 (설계-구현-테스트-배포) |
| `/workflows:tdd-cycle` | TDD 자동화 (Red-Green-Refactor) |
| `/workflows:full-review` | 종합 코드 리뷰 |
| `/workflows:security-hardening` | 보안 강화 워크플로우 |
| `/workflows:smart-fix` | 지능형 문제 해결 (자동 에이전트 선택) |
| `/workflows:incident-response` | 장애 대응 프로세스 |

### 로그 (Logs) — 5개
| 커맨드 | 용도 |
|--------|------|
| `/session-log` | 세션 로그 생성/종료 처리 |
| `/daily-log` | 데일리 로그 작성/업데이트 |
| `/daily-close` | 하루 마감 (로그 마감 + 문서 현행화 + 커밋) |
| `/scrum-log` | 스크럼 미팅 로그 작성 |
| `/vibe-log` | 바이브 로그 작성/업데이트 |

### 유틸리티 — 4개
| 커맨드 | 용도 |
|--------|------|
| `/simplify` | 변경 코드의 재사용성·품질·효율 리뷰 후 개선 |
| `/loop` | 프롬프트/슬래시 커맨드를 주기적 반복 실행 |
| `/claude-api` | Claude API / Anthropic SDK 활용 앱 빌드 지원 |
| `/keybindings-help` | 키보드 단축키 커스터마이징 |

## 3. MCP 서버 설정

### 3.1 MCP란?
Model Context Protocol. Claude Code가 외부 도구/서비스와 직접 통신하는 프로토콜.

### 3.2 설정된 MCP 서버 (4개)

설정 파일: 프로젝트 루트 `.mcp.json`

| # | MCP 서버 | 패키지 | 용도 | 상태 (2026-03-08) | 로드된 도구 수 |
|---|----------|--------|------|-------------------|---------------|
| 1 | github | `@modelcontextprotocol/server-github` | Issues, PR, Branch, Search | ✅ 정상 | 22개 |
| 2 | filesystem | `@modelcontextprotocol/server-filesystem` | 파일/디렉토리 작업 확장 | ✅ 정상 | 15개 |
| 3 | postgres | `@bytebase/dbhub` | DB 스키마 조회, SQL 실행 | ✅ 정상 | 2개 |
| 4 | kubernetes | `mcp-server-kubernetes` | kubectl 자동화 | ✅ 정상 | 30개+ |

> **참고**: docker MCP(`@thelord/mcp-server-docker-npx`)는 프로세스 다중 fork 버그로 메모리 폭주를 유발하여 삭제함 (2026-03-08). Docker 연동은 Bash에서 `docker` / `docker compose` 명령으로 직접 실행.

### 3.3 MCP 설정 파일 (`.mcp.json`)

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem",
               "/mnt/d/Users/KTDS/Documents/06.과제/RummiArena"]
    },
    "postgres": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@bytebase/dbhub",
               "--dsn", "postgresql://rummikub:<YOUR_DB_PASSWORD>@localhost:5432/rummikub"]
    },
    "kubernetes": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-server-kubernetes"]
    }
  }
}
```

### 3.4 주요 MCP 도구 목록

#### GitHub MCP (22개)
| 도구 | 설명 |
|------|------|
| `create_issue` / `get_issue` / `list_issues` / `update_issue` | 이슈 CRUD |
| `create_pull_request` / `get_pull_request` / `merge_pull_request` | PR 관리 |
| `get_pull_request_files` / `get_pull_request_reviews` / `get_pull_request_comments` | PR 리뷰 |
| `create_pull_request_review` / `update_pull_request_branch` / `get_pull_request_status` | PR 상태 |
| `create_branch` / `list_commits` | 브랜치/커밋 |
| `get_file_contents` / `create_or_update_file` / `push_files` | 파일 관리 |
| `search_code` / `search_issues` / `search_repositories` / `search_users` | 검색 |
| `create_repository` / `fork_repository` / `add_issue_comment` | 기타 |

#### Filesystem MCP (15개)
| 도구 | 설명 |
|------|------|
| `read_file` / `read_text_file` / `read_multiple_files` / `read_media_file` | 파일 읽기 |
| `write_file` / `edit_file` | 파일 쓰기/편집 |
| `create_directory` / `move_file` | 디렉토리/이동 |
| `list_directory` / `list_directory_with_sizes` / `directory_tree` | 목록/트리 |
| `search_files` / `get_file_info` / `list_allowed_directories` | 검색/정보 |

#### PostgreSQL MCP (2개)
| 도구 | 설명 |
|------|------|
| `execute_sql` | SQL 쿼리 실행 |
| `search_objects` | DB 객체 검색 |

### 3.5 GitHub MCP 활용 예시
- Issues 자동 생성 (WBS 기반)
- PR 생성/리뷰
- Projects 보드 관리
- Labels/Milestones 관리

## 4. 프로젝트별 활용 시나리오

| 상황 | 사용 도구 |
|------|-----------|
| 새 기능 개발 | `/workflows:feature-development` |
| 게임 엔진 TDD | `/workflows:tdd-cycle` |
| AI Adapter 코드 리뷰 | `/tools:ai-review` |
| 보안 점검 | `/tools:security-scan` + `/tools:deps-audit` |
| 버그 수정 | `/workflows:smart-fix` |
| PR 제출 전 | `/tools:pr-enhance` |
| API 문서 생성 | `/tools:doc-generate` |
| Sprint 시작 시 | `/tools:context-restore` |
| Sprint 종료 시 | `/tools:context-save` |
| 세션 시작/종료 | `/session-log` |
| 하루 마감 | `/daily-close` |
| 스크럼 미팅 | `/scrum-log` |

## 5. 참고 링크
- Claude Code: https://claude.ai/code
- MCP 프로토콜: https://modelcontextprotocol.io
- GitHub MCP Server: https://github.com/modelcontextprotocol/servers
- DBHub (PostgreSQL MCP): https://github.com/bytebase/dbhub
