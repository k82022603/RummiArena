# Sprint 7 프로젝트 회고 -- devops

- **역할**: K8s/Helm/ArgoCD 배포, Docker 이미지 빌드, CI 17/17 GREEN 유지
- **Sprint**: Sprint 7 (2026-04-22 ~ 2026-04-29)
- **작성일**: 2026-04-29

---

## 잘한 점 (Keep)
- Sprint 7 기간 동안 K8s 배포를 약 30회 이상 수행하면서 namespace rummikub 7개 서비스 Running 상태를 유지했다. `phase-d-b254b04`, `g-b-fix-7a0b0c5`, `g-e-2442913`, `day6-364e271`, `p0fix-2c19601` 등 태그별 추적 가능한 배포 이력을 관리했다.
- `docs/05-deployment/10-smoke-criteria.md`와 `11-rollback-criteria.md`를 작성하여 배포 품질 기준을 명문화했다. smoke 5축(INF/GAME/REARRANGE/I18N/DRAG)과 rollback 10 트리거를 정의. `scripts/smoke.sh --all` 자동화 스크립트 포함.
- SEC-A 이후 Go 이미지 `golang:1.24-alpine` -> `golang:1.25-alpine` 교체를 Dockerfile과 CI 모두에서 일관되게 수행.
- ArgoCD UI 접근 복구(insecure 모드 + port-forward)를 진단하고 해결. 사용자가 ArgoCD 대시보드를 통해 배포 상태를 직접 확인할 수 있게 했다.
- Day 2에 Docker Desktop 기동 후 이미지 3개 재빌드 + K8s rollout을 한 번에 처리. rooms dual-write 회귀 없음까지 확인.

## 아쉬운 점 (Problem)
- Day 3 이미지 드리프트 사고 2건이 devops 책임이다. PR 머지 직후 재빌드 규칙이 없어서 PR #78 이전 소스로 빌드된 이미지가 배포됐다. 같은 날 ai-adapter CrashLoop도 `origin/main` fetch 타이밍 문제였다.
- "배포 성공 = 품질 보증"이라는 착각이 있었다. Pod Running 상태만 확인하고, 실제 사용자 경험이 정상인지까지 검증하지 않았다. smoke 기준을 만든 것은 이 반성의 산물.
- CI 17/17 GREEN은 유지했지만, E2E와 smoke를 CI 파이프라인에 편입하지 못한 채 스프린트가 끝났다.

## 시도할 점 (Try)
- 빌드 전 `git log origin/main -1`로 HEAD SHA를 확인하고, Docker label에 커밋 SHA를 포함하는 것을 자동화한다.
- CI 파이프라인에 smoke 5축 중 최소 INF(health check) + GAME(room create)을 post-deploy 단계로 편입한다.

## 이번 스프린트에서 가장 기억에 남는 순간
- Day 3 저녁 반성에서 "규칙 쓰는 사람 = 따르는 사람이 같아야 한다"고 말한 순간. smoke-criteria를 내가 만들었는데 내가 안 지킨 것이 부끄러웠고, 그래서 다음날부터 진짜 지켰다.

## 팀에게 한마디
- 인프라는 보이지 않을 때 가장 잘 하고 있는 것이다. 30회 배포 중 사고가 3건이었다는 건 27회는 조용히 성공했다는 뜻이기도 하다. 하지만 3건도 0건으로 줄여야 한다.
