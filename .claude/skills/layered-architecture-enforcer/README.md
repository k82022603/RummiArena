# 계층형 아키텍처 강제

> "AI는 당신의 아키텍처를 깨뜨리지 않는다. 조용히 구부려서 형태를 잃게 만든다."

## 언제 사용하나

- AI가 생성한 코드에서 계층 분리 안티패턴을 검출할 때
- 새 엔드포인트를 생성할 때 (Controller -> Service -> Repository 순서 강제)
- 코드 리뷰에서 계층 위반 여부를 점검할 때

## 핵심 흐름

1. 안티패턴 탐지: Controller -> Repository 직접 호출, Service에 DTO 전달 등 4종 금지 패턴 확인
2. 계층별 책임 검증: Controller(HTTP 처리), Service(비즈니스 로직), Repository(데이터 접근) 분리
3. 코드 생성 규칙 적용: DTO -> Entity -> Service -> Repository -> Controller 순서
4. 검증 체크리스트: import 방향, 순환 의존, 비즈니스 로직 위치

## 관련 문서

- `.claude/skills/code-modification/SKILL.md` -- 코드 수정 표준 절차
- `docs/02-design/` -- 아키텍처 설계 문서

## 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-01-24 | v1.0 | 최초 작성 (Java/Python/TypeScript 패턴 포함) |
