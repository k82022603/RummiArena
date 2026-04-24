# Pull Request

## Summary
<!-- 이 PR 이 해결하는 문제 / 추가하는 기능을 1~3줄로 -->

## Changes
<!-- 변경 사항 bullet 3~7개 -->
-
-
-

## Related Issue / Ticket
<!-- Closes #NNN / Fixes BUG-UI-NNN -->

## Testing
<!-- 어떻게 검증했는가. 로컬 재현, Playwright 실행 로그 등 -->
- [ ] 단위 테스트 (`go test ./...` / `pnpm test`) GREEN
- [ ] Playwright 관련 spec GREEN
- [ ] 재현 spec 을 **구현 전에 먼저 커밋** (RED → GREEN 히스토리 존재)

## Deployment Gate — Pre-deploy Playbook
<!-- 정책: docs/05-deployment/09-pre-deploy-playbook-gate.md -->
<!-- release / hotfix 라벨 PR 은 아래 체크 필수. docs / test-only / configmap-only PR 은 면제 -->
- [ ] **pre-deploy-playbook 스킬 실행 증거 첨부** (release / hotfix 라벨 PR 에 한함)
  - 로그 요약 (GO/NO-GO 판정 포함)
  - Playwright `trace.zip` 경로 또는 artifact 링크
  - BUILD_ID 검증 (release 태그 배포 시)
- [ ] Playbook 면제 대상이면 사유 명시 (예: `docs-only`, `test-only`, `infra configmap value-only`)

## Review Checklist (Sprint 7 재편 원칙)
- [ ] UI 수정 PR 은 architect + frontend-dev 페어 리뷰 증거 (PR 코멘트 2인 승인 이상)
- [ ] 한글 i18n / 마이크로카피 변경 시 designer 승인
- [ ] 동일 함수 3회 이상 핫픽스 누적 시 리팩터 ADR 링크 (architect 구조 부채 누적 카운터 정책)
- [ ] `.env`, `*.pem`, `*-key.pem` 파일 포함 없음 확인

## Screenshots / Evidence (UI PR 에 한함)
<!-- before / after 스크린샷 or 영상 -->

## Breaking Changes
- [ ] 없음
- [ ] 있음 — 하단에 migration 경로 기재

---
Generated with Claude Code
