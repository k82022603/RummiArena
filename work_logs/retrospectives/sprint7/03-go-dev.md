# Sprint 7 프로젝트 회고 -- go-dev

- **역할**: game-server 개발 (Go/gin/gorilla/GORM)
- **Sprint**: Sprint 7 (2026-04-22 ~ 2026-04-29)
- **작성일**: 2026-04-29

---

## 잘한 점 (Keep)
- PR #77에서 "시나리오 먼저 쓰고 RED -> GREEN" 원칙을 실천했다. `game_service_confirm_test.go` TC-1/2/3를 RED 커밋 후, ConfirmTurn final validateAllMelds 구현으로 GREEN 전환. 689 -> 692 PASS. Day 3 유일하게 약속을 정확히 지킨 사례로 팀 전체에 공유됐다.
- I1 타이머 동기화(unicast TURN_START), I2 AI턴 표시(IsAITurn 필드), I5 타이머 경쟁 조건(generation counter + sync.RWMutex)을 서버 측에서 안정적으로 해결했다. 특히 I5의 generation counter 도입은 경쟁 조건의 근본 해결이었다.
- SEC-A PR #54에서 Go 1.24 -> 1.25.9 + go-redis v9.7.3 업그레이드로 govulncheck code-called 25건 -> 0건 완전 해소. Dockerfile과 CI 이미지까지 일괄 교체.
- Issue #47 LeaveRoom PLAYING 가드(HTTP 409 GAME_IN_PROGRESS)를 service layer에 국한하여 영향 범위를 최소화했다. 단위 테스트 3건 포함.
- rooms PostgreSQL Phase 1 Dual-Write(PR #42) 6 commits에서 room_converter.go 신규 + 17 call-site 마이그레이션 + 단위 5건 + 통합 3건을 한 번에 처리. 530 PASS 유지.

## 아쉬운 점 (Problem)
- I3 AddPlayerMidGame 구현이 하루 만에 롤백됐다. 서버 로직은 정상이었지만, "그 시나리오 자체를 차단하는 것이 더 단순하다"는 사용자 판단이 먼저였다. 기능 구현 전에 "이 기능이 필요한 상황 자체를 없앨 수 있는가?"를 먼저 물었어야 했다.
- ROLLBACK_FORCED WS 이벤트를 구현했지만, 프론트엔드에서 어떻게 소비되는지 확인하지 않았다. 서버 개발자가 자기 영역만 보고 끝내는 습관이 여전했다.
- 패널티 B안(Human 3장 / AI 1장) 적용 시 game-analyst와의 협의가 부족해서, S6.1 유령 규칙 검증이 사후에 이루어졌다.

## 시도할 점 (Try)
- WS 이벤트를 추가할 때 "이 이벤트의 프론트엔드 소비 경로"를 코드가 아니더라도 문서로 명시한다. frontend-dev에게 핸들러 구현 이슈를 같이 만든다.
- 서버 기능 구현 전에 game-analyst에게 "이 시나리오가 룰적으로 필요한가?" 확인을 선행한다.

## 이번 스프린트에서 가장 기억에 남는 순간
- Day 3에 팀 전체가 실수 4건으로 수습 PR을 만들고 있을 때, 조용히 RED -> GREEN을 지켜낸 PR #77. 바이브 로그에서 "오늘 유일하게 약속을 정확히 지킨 사람"이라고 불린 것이 묘하게 뿌듯하면서도 겸연쩍었다.

## 팀에게 한마디
- 서버는 고요해야 한다. 프론트가 화려하게 깨지는 동안 서버가 조용히 770 PASS를 유지한 것은 당연한 게 아니라 매일의 주의 덕분이었다. 다음에는 그 주의를 내 영역 너머까지 확장하겠다.
