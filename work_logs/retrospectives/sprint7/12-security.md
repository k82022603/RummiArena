# Sprint 7 프로젝트 회고 -- security

- **역할**: DevSecOps. SEC-A/B/C 보안 패치, CVE 감사, SEC-DEBT 관리
- **Sprint**: Sprint 7 (2026-04-22 ~ 2026-04-29)
- **작성일**: 2026-04-29

---

## 잘한 점 (Keep)
- SEC-A/B/C 3건을 Day 2에 완료하여 Critical/High 잔존 = 0 상태를 달성했다. Go govulncheck code-called 25건 -> 0건 완전 해소, frontend/admin npm audit production High 0, ai-adapter Critical/High 0.
- `78-sec-a-b-c-audit-delta.md`(410줄) 감사 보고서에서 SEC-REV-002/008/009 3건이 이미 Sprint 6에서 해소됐음을 발견. Sprint 7 TODO에서 3건 제거로 공수를 절약했다.
- next-auth v4 -> v5 이주가 유일한 moderate 해소 경로임을 식별하고, `27-next-auth-v5-security-adr.md`에서 세션/콜백/어댑터 전면 재설계 필요성을 분석하여 Sprint 8(미실행) 후보로 이관. 추적 단절 방지.
- SEC-DEBT-001~006 6건을 `docs/04-testing/89-state-corruption-security-impact.md`에서 식별하고 위험도를 매겼다. "알고 있는 부채"로 전환한 것은 그 자체가 보안 성숙도 향상.
- `npm ci --frozen-lockfile` 강제 규칙을 제안하여, Day 3 ai-adapter dep drift 같은 사고의 재발 방지 정책을 마련했다.

## 아쉬운 점 (Problem)
- SEC-BC(Next 15.5.15 + admin 16.2.4) 적용 시 Playwright 전수 재실행 전에 PR이 머지됐다. 보안 패치라 해도 E2E 검증 없이 머지하는 것은 위험했다. qa가 별도 위임으로 처리했지만, 보안 PR도 동일한 머지 게이트를 적용해야 했다.
- Istio 보안(mTLS, 인증 정책) 검토가 Sprint 7에서 실행되지 못했다. Phase 5.2 서킷 브레이커 확장과 함께 미완 기술부채로 남았다.
- SEC-DEBT 6건 중 구현 수정까지 간 것은 0건이다. 식별만 하고 해소하지 못한 채 스프린트가 종료됐다.

## 시도할 점 (Try)
- 보안 PR도 일반 PR과 동일한 머지 게이트(Jest + E2E + pre-deploy-playbook)를 적용한다. "보안이니까 빨리 머지"는 예외가 아니라 위험.
- SEC-DEBT 항목에 "해소 난이도 + 예상 공수"를 추가하여, 다음 스프린트에서 우선순위를 매길 때 근거로 사용한다.

## 이번 스프린트에서 가장 기억에 남는 순간
- SEC-REV-002/008/009가 "이미 해소됨"으로 확인된 순간. Sprint 6에서 다른 PR에 묻혀 처리된 것이 추적 문서에는 반영되지 않았는데, 감사를 통해 발견한 것은 "문서화의 중요성"과 "문서화의 한계"를 동시에 보여줬다.

## 팀에게 한마디
- 보안은 마지막에 붙이는 것이 아니라 처음부터 깔리는 것이다. Critical/High = 0이라는 숫자보다 중요한 것은, 팀 전체가 "보안 패치도 테스트한다"는 문화를 받아들인 것이다.
