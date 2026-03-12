팀 전체 회의(All-Hands)를 진행한다.

## 팀 구성
| 역할 | 커맨드 | 담당 |
|------|--------|------|
| PM | `/team:pm` | 일정/리스크/스크럼/백로그 |
| Architect | `/team:architect` | 아키텍처/기술 의사결정 |
| Go Dev | `/team:go-dev` | game-server (Go) |
| Node Dev | `/team:node-dev` | ai-adapter (NestJS) |
| Frontend Dev | `/team:frontend` | 게임 UI / 관리자 대시보드 |
| Designer | `/team:designer` | UI/UX / 와이어프레임 |
| QA | `/team:qa` | 테스트 / 품질 관리 |
| DevOps | `/team:devops` | K8s / CI·CD / Helm |
| Security | `/team:security` | DevSecOps / 보안 |
| AI Engineer | `/team:ai-engineer` | LLM / 프롬프트 / AI 캐릭터 |

## 실행
1. 각 팀원의 관점에서 현재 상태를 점검한다
2. 사용자의 안건($ARGUMENTS)에 대해 각 역할별로 의견을 제시한다
3. 역할 간 충돌이 있으면 트레이드오프를 분석하여 제시한다
4. 결론과 액션 아이템을 도출한다

## 출력 형식
```
## All-Hands Meeting
**안건**: (사용자 입력)

### PM
(일정/리소스 관점 의견)

### Architect
(아키텍처/설계 관점 의견)

### (해당 역할들...)
(각자 관점 의견)

### 결론
- 합의 사항
- 액션 아이템 (담당자 포함)
```

안건: $ARGUMENTS
