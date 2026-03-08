# Claude Code (Skills / MCP) 매뉴얼

## 1. 개요
AI 개발 어시스턴트. Skills와 MCP 서버를 통해 프로젝트 도구와 직접 연동.
이 프로젝트에서는 코드 리뷰, 문서 생성, 보안 스캔, GitHub 연동 등에 활용.

## 2. 사용 가능한 Skills

### 도구 (Tools)
| 커맨드 | 용도 |
|--------|------|
| `/tools:security-scan` | OWASP Top 10 보안 취약점 스캔 |
| `/tools:deps-audit` | 의존성 보안 감사 |
| `/tools:doc-generate` | API/코드 문서 자동 생성 |
| `/tools:code-explain` | 코드 설명 및 문서화 |
| `/tools:debug-trace` | 디버깅 추적, 근본 원인 분석 |
| `/tools:refactor-clean` | 리팩토링, 클린 코드 |
| `/tools:error-analysis` | 에러 분석, 해결책 제시 |
| `/tools:ai-review` | AI/ML 코드 리뷰 (LLM, RAG) |
| `/tools:tech-debt` | 기술 부채 분석 |
| `/tools:context-save` | 프로젝트 컨텍스트 저장 |
| `/tools:context-restore` | 저장된 컨텍스트 복원 |
| `/tools:pr-enhance` | PR 품질 개선 |
| `/tools:issue` | GitHub 이슈 분석 및 수정 |

### 워크플로우 (Workflows)
| 커맨드 | 용도 |
|--------|------|
| `/workflows:feature-development` | 기능 개발 전체 사이클 |
| `/workflows:tdd-cycle` | TDD 자동화 (Red-Green-Refactor) |
| `/workflows:full-review` | 종합 코드 리뷰 |
| `/workflows:security-hardening` | 보안 강화 |
| `/workflows:smart-fix` | 지능형 문제 해결 |
| `/workflows:incident-response` | 장애 대응 |

## 3. MCP 서버 설정

### 3.1 MCP란?
Model Context Protocol. Claude Code가 외부 도구/서비스와 직접 통신하는 프로토콜.

### 3.2 이 프로젝트에 유용한 MCP 서버

| MCP 서버 | 용도 | 도입 시점 |
|----------|------|-----------|
| GitHub MCP | Issues, PR, Projects 관리 | Phase 1 |
| PostgreSQL MCP | DB 스키마 조회, 쿼리 실행 | Phase 2 |
| Docker MCP | 컨테이너/이미지 관리 | Phase 2 |
| Kubernetes MCP | kubectl 자동화 | Phase 2 |
| Filesystem MCP | 파일 작업 확장 | 선택 |

### 3.3 MCP 설정 방법

Claude Code 설정 파일 (`.claude/settings.json` 또는 프로젝트 설정):

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-token>"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@localhost:5432/rummikub"
      }
    }
  }
}
```

### 3.4 GitHub MCP 활용 예시
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

## 5. 참고 링크
- Claude Code: https://claude.ai/code
- MCP 프로토콜: https://modelcontextprotocol.io
