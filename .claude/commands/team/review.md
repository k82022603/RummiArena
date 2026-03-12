팀 코드 리뷰를 진행한다.

각 역할의 관점에서 코드 또는 문서를 리뷰한다.

## 리뷰 관점
| 역할 | 리뷰 포커스 |
|------|-----------|
| Architect | 아키텍처 원칙 준수, 계층 분리, 의존성 방향 |
| Go Dev / Node Dev | 코드 품질, 관용적 스타일, 에러 처리 |
| QA | 테스트 커버리지, 엣지 케이스, 회귀 위험 |
| Security | OWASP Top 10, 입력 검증, Secret 노출 |
| DevOps | Dockerfile 최적화, 리소스 설정, 배포 호환성 |

## 실행
1. 대상 코드/문서를 읽는다
2. 각 역할별 관점에서 이슈를 식별한다
3. 심각도별(Critical/Major/Minor/Suggestion)로 분류한다
4. 개선안을 구체적으로 제시한다

## 출력 형식
```
## Team Review
**대상**: (파일/기능명)

### Critical
- [역할] 이슈 설명 → 개선안

### Major
- [역할] 이슈 설명 → 개선안

### Minor / Suggestion
- [역할] 제안 사항
```

리뷰 대상: $ARGUMENTS
