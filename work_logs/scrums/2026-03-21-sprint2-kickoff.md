# Sprint 2 킥오프 스크럼 미팅

- **날짜**: 2026-03-21
- **유형**: Sprint 2 킥오프 (All-Hands 회의)
- **Sprint**: Sprint 2 (2026-03-29 ~ 04-11, 2주, 30 SP)
- **참석자**: 애벌레 (PO), PM, Architect, Go Dev, Node Dev, Frontend Dev, Designer, QA, DevOps, Security, AI Engineer

## Sprint 2 목표

> AI 캐릭터 시스템 + E2E 자동화 + 관리자 대시보드 + 연습 모드 Stage 1~3

## 이슈 목록

| Issue | 제목 | 우선순위 | SP | 담당 |
|-------|------|---------|-----|------|
| #20 | AI 캐릭터 시스템 구현 | P0-critical | 10 | Node Dev + AI Engineer |
| #21 | 게임 흐름 E2E 테스트 | P1-high | 5 | Go Dev + QA |
| #22 | 관리자 대시보드 기본 기능 | P1-high | 8 | Frontend Dev + DevOps |
| #23 | 1인 연습 모드 Stage 1~3 | P1-high | 7 | Frontend Dev |

**합계: 30 SP**

## 팀별 준비 현황

### Go Dev — E2E 테스트 (#21)
- httptest 패턴 이미 확립 (auth_handler_test.go)
- 블로커: RoomService/GameService DI 리팩토링 + AI HTTP client 미구현
- Day 1 선행: AI adapter 호출 인터페이스 Go 측 정의

### Node Dev + AI Engineer — AI 캐릭터 (#20)
- persona.templates.ts 이미 구현됨 (6캐릭터 x 3난이도 x 심리전 Lv.0~3)
- 추가 구현: callLlm() temperature 파라미터화, Rookie 후처리 실수율, Ollama 모델 gemma3:4b 수정
- 블로커: 실제 LLM 호출 stub 상태 → 연동 코드 필요

### Frontend Dev + Designer — 관리자 (#22) + 연습모드 (#23)
- admin 앱 shell 존재, 페이지 없음
- PracticeClient mock 완성, API 연동 대기
- 선행: Designer 레이아웃 가이드 → Frontend Dev 전달 완료 (본 회의)

### DevOps — 인프라 선행
- dev-values.yaml 이미지 태그 블록 활성화 (P1)
- helm/charts/admin/ Chart 신규 생성 (P1)
- build-admin / lint-admin CI job 추가 (P2)

### Security — 즉시 수정 필요
- JWT_SECRET 빈 문자열 fail-fast 로직
- LLM API Key → K8s Secret 이관
- RBAC 미들웨어 구현

## 기술 의존성 (블로킹 관계)

```
game-server AI client(미구현)
    ↓ blocks
#20 AI 캐릭터 + #21 E2E AI 턴 시나리오
```

```
game-server Admin API(미구현)
    ↓ blocks
#22 관리자 대시보드
```

```
game-server Practice API(미구현)
    ↓ blocks
#23 연습 모드 (현재 mock으로 진행 가능)
```

## 합의 사항

1. **Day 1 (2026-03-29) 필수 합의**: game-server → ai-adapter HTTP 계약 (엔드포인트, DTO, 타임아웃, 재시도)
2. **병렬 진행 전략**: admin Helm chart + CI job은 DevOps가 Sprint 시작 전(03-29 이전) 선행
3. **30 SP 현실성**: persona.templates.ts 이미 구현으로 #20 실제 구현 볼륨 감소 예상 → 30 SP 유지 가능
4. **연습 모드 mock 선진행**: game-server Practice API 미구현 → frontend mock으로 Stage 1~3 UX 완성 후 API 연동
5. **JWT_SECRET fail-fast**: Sprint 2 Day 1에 security fix로 처리 (P0)
6. **Ollama 모델 수정**: ai-adapter .env의 OLLAMA_DEFAULT_MODEL을 gemma3:4b로 수정

## 액션 아이템

| # | 항목 | 담당 | 기한 |
|---|------|------|------|
| A-01 | dev-values.yaml 이미지 태그 블록 활성화 | DevOps | 2026-03-28 (Sprint 시작 전) |
| A-02 | helm/charts/admin/ Chart 생성 + CI job 추가 | DevOps | 2026-03-28 |
| A-03 | JWT_SECRET fail-fast 로직 추가 | Go Dev | 2026-03-29 Day 1 |
| A-04 | game-server AI HTTP client 인터페이스 정의 | Go Dev + Node Dev | 2026-03-29 Day 1 |
| A-05 | callLlm() temperature 파라미터화 | Node Dev + AI Engineer | 2026-03-29 Day 1 |
| A-06 | Ollama OLLAMA_DEFAULT_MODEL=gemma3:4b 수정 | Node Dev | 2026-03-29 |
| A-07 | 교대 실행 스케줄 확정 문서화 | PM | 2026-03-28 |

## 리스크

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| game-server AI client 구현 지연 | 중 | #21 E2E 블로킹 | mock client로 E2E 선진행 |
| Ollama 4B 모델 JSON 오류 | 높 | AI 캐릭터 품질 | 재시도 5회로 증가 |
| 16GB RAM 부족 | 중 | 교대 실행 강제 | 스케줄 사전 확정 |
| 30 SP 과부하 | 중 | 미완성 이슈 | #22 또는 #23 Sprint 3 이월 검토 |

## 다음 스크럼

- **일시**: 2026-03-29 (Sprint 2 Day 1)
- **형태**: 일일 스크럼 (작업 시작 시 업데이트)
