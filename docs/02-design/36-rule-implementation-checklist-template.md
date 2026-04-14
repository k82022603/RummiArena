# 36. 게임 규칙 구현 6항목 체크리스트 템플릿

> **목적**: 새 게임 규칙 추가 또는 기존 규칙 수정 시, 엔진 한정 PASS를 규칙 PASS로 오등가하지 않도록 설계부터 추적성 매트릭스까지의 6단계를 강제한다.
>
> **계기**: 2026-04-13 V-13 재배치 합병 UI 누락 사건 (Engine 717 PASS + E2E 58 PASS에도 사용자가 라이브 테스트에서 기능 부재 발견). 감사 보고 `docs/04-testing/48-game-rule-coverage-audit.md` §8 권고안의 공식 템플릿화.

**최종 갱신**: 2026-04-14 (Sprint 6 Day 3, B1)

---

## 1. 사용 방법

1. 새 규칙을 도입하거나 기존 규칙을 수정하는 PR 본문 최상단에 본 체크리스트를 **그대로 복사**한다.
2. 6개 항목 **모두** ✅가 되어야 "규칙 구현 완료"로 간주한다.
3. 하나라도 ⚠️/❌이면 PR 본문에 **왜**와 **후속 티켓 번호**를 명시한다.
4. 머지 전 리뷰어는 각 항목의 증거 경로(파일:라인, 커밋 해시, 테스트 이름)가 명시되었는지 확인한다.
5. 머지 직후 `docs/02-design/31-game-rule-traceability.md` §1 매트릭스의 해당 행을 갱신한다.

---

## 2. 6항목 체크리스트

### [ ] (1) 문서 — 규칙 정의가 설계 문서에 존재하는가?

**Definition of Done**:
- `docs/02-design/06-game-rules.md` 해당 섹션에 규칙 텍스트가 존재하고 예시가 최소 1건 포함된다.
- 규칙 ID(`V-xx` 또는 `V-xxx`)가 할당되어 있다.
- 관련 에러 코드(있다면)가 `docs/02-design/29-error-code-registry.md`에 등록되어 있다.

**확인 명령어**:
```bash
grep -n "V-xx" docs/02-design/06-game-rules.md
grep -n "V-xx\|ERR_XXX" docs/02-design/29-error-code-registry.md
```

---

### [ ] (2) 엔진 구현 — 서버에서 해당 규칙을 강제하는가?

**Definition of Done**:
- `src/game-server/internal/engine/` 또는 `internal/service/` 에 실제로 검증/실행되는 Go 코드가 있다.
- 에러 코드를 반환하는 규칙은 해당 에러 상수가 `engine/errors.go`에 등록되어 있고 `ValidateTurnConfirm` 또는 관련 validator에서 **실제 호출**된다.
- 단순 상수 선언만 있고 호출되지 않는 "orphan code"는 ❌로 표기한다 (예: `ErrNoRearrangePerm` 사례).

**확인 명령어**:
```bash
grep -rn "ErrXxx" src/game-server/internal/engine/ src/game-server/internal/service/ src/game-server/internal/handler/
# orphan code 감지: 상수가 정의만 되고 사용되지 않는지 확인
```

---

### [ ] (3) 엔진 테스트 — Happy + Negative 각 1건 이상 Go 유닛 테스트가 있는가?

**Definition of Done**:
- `src/game-server/internal/engine/*_test.go` 또는 `internal/service/*_test.go` 에 해당 규칙을 이름으로 찾을 수 있는 테스트 함수가 있다.
- Happy Path(규칙 통과 시) 1건 + Negative(규칙 위반 시 에러 반환) 1건 최소.
- `go test ./...` 에서 PASS한다.

**확인 명령어**:
```bash
cd src/game-server
go test -run V_xx -v ./internal/engine/... ./internal/service/...
go test ./... | grep -E "FAIL|ok" | tail -20
```

---

### [ ] (4) UI 구현 — 사용자가 실제로 해당 동작을 수행할 수 있는 프론트 경로가 있는가?

**Definition of Done**:
- `src/frontend/src/app/game/[roomId]/GameClient.tsx` 또는 관련 컴포넌트(`components/game/*.tsx`)에 인터랙션 핸들러가 존재한다.
- 단순 서버 에러 메시지 표시만으로는 불충분 — 사용자가 해당 액션을 **입력**할 수 있는 경로(드래그, 버튼, 입력창 등)가 있어야 한다.
- 서버 전용 규칙(예: 타일 보존 법칙 V-06)은 "서버 검증 트리거" 경로가 존재하는 것으로 충분 (GameClient가 해당 상태를 서버에 보내고 에러를 받아 렌더링).

**확인 명령어**:
```bash
grep -rn "handleXxx\|useXxx" src/frontend/src/app/game src/frontend/src/components/game
# 핵심 파일: GameClient.tsx, GameBoard.tsx, PlayerRack.tsx, ActionBar.tsx
```

**주의사항 (V-13 사건 교훈)**:
> "엔진 검증이 있으니 UI는 서버 에러 메시지만 표시하면 된다"는 오등가를 금지한다. 사용자가 해당 입력을 **시도조차 할 수 없다면** ❌다. 예: V-13c 재배치 합병은 엔진이 4색 그룹을 검증하지만, 사용자가 랙 타일을 서버 확정 그룹에 드롭할 경로가 없으면 규칙 미구현으로 간주한다.

---

### [ ] (5) E2E 테스트 — Playwright Happy + Negative 시나리오가 있는가?

**Definition of Done**:
- `src/frontend/e2e/*.spec.ts` 파일에 해당 규칙을 검증하는 test가 있다 (Happy 1건 이상, 가능하면 Negative 1건).
- test.fixme로 보류된 케이스는 사유와 해제 예정 시점을 코멘트에 명시한다. 머지 전 fixme 해제는 **선택**이지만 추적성 매트릭스에서는 ⚠️로 표기한다.
- 결정론적 테스트가 불가능한 경우 (조커/확률 의존): `e2e/helpers/game-helpers.ts`의 `window.__gameStore.setState` 브리지로 상태를 강제 주입한다. 지원되지 않으면 B3 결정론적 프레임워크 대기로 분류.

**확인 명령어**:
```bash
cd src/frontend
grep -rn "V-xx\|Rule Xxx\|TC-Xx" e2e/*.spec.ts
npx playwright test --list | grep "해당 규칙"
```

---

### [ ] (6) 추적성 매트릭스 — 3단계 7컬럼이 모두 갱신되었는가?

**Definition of Done**:
- `docs/02-design/31-game-rule-traceability.md` §1 매트릭스에 해당 규칙 행이 존재한다.
- Engine 구현 / Engine 테스트 / UI 구현 / UI 테스트(E2E) / Playtest / 종합 — 6개 컬럼이 모두 채워져 있다 (N/A도 허용, 단 사유 주석 필수).
- 종합 컬럼은 앞 5개 중 하나라도 ⚠️/❌이면 "부분" 또는 "미완"으로 표기한다.
- §11 "요약" 섹션의 ✅/⚠️/❌ 합계가 실제 행 수와 일치한다.

**확인 명령어**:
```bash
grep -n "V-xx" docs/02-design/31-game-rule-traceability.md
# §11 요약 테이블의 카운트가 일치하는지 수작업 점검
```

---

## 3. PR 본문용 복사-붙여넣기 블록

```markdown
### 게임 규칙 구현 6항목 체크리스트 (V-xx)

- [ ] (1) 문서 — `docs/02-design/06-game-rules.md` §X.Y + 에러코드 등록
- [ ] (2) 엔진 구현 — `path/to/file.go:Lnnn` (orphan 아님 확인)
- [ ] (3) 엔진 테스트 — Happy: `TestXxxHappy` / Negative: `TestXxxFail`
- [ ] (4) UI 구현 — `GameClient.tsx handleXxx` 또는 `ComponentX`
- [ ] (5) E2E 테스트 — `e2e/xxx.spec.ts TC-XX-NN` (fixme 여부 명시)
- [ ] (6) 추적성 매트릭스 — `docs/02-design/31-game-rule-traceability.md §1` 갱신 커밋

**결손 항목이 있다면 사유와 후속 티켓**:
- 예: (5) ❌ — 조커 확률 의존으로 결정론 프레임워크(B3) 도입 후 후속. 티켓 #XX.
```

---

## 4. 예시: V-13c 재배치 합병 (사건의 당사자, 2026-04-13 수정본)

```markdown
### 게임 규칙 구현 6항목 체크리스트 (V-13c 재배치 합병)

- [x] (1) 문서 — `06-game-rules.md §6.2 유형 2`
- [x] (2) 엔진 구현 — `engine/validator.go:50-57 ValidateTable` + `engine/group.go` 4색 그룹 검증
- [x] (3) 엔진 테스트 — `engine/group_test.go` 4색 그룹 Happy, `validator_test.go:432-509` conservation Negative
- [x] (4) UI 구현 — `GameClient.tsx handleDragEnd` 서버 확정 그룹 머지 분기 (`23e770a`, 2026-04-13)
- [⚠️] (5) E2E 테스트 — `e2e/rearrangement.spec.ts TC-RR-01 Happy (fixme, 프론트 재배포 대기)` + `TC-RR-02 Negative PASS` (`adf0d84`)
- [x] (6) 추적성 매트릭스 — `docs/02-design/31-game-rule-traceability.md §1.1` V-13c 행 갱신 (2026-04-13)

**결손 항목 사유**: (5) TC-RR-01 Happy는 프론트 재배포 후 fixme 해제 예정. 추적성 매트릭스 종합 컬럼은 "부분"으로 유지.
```

---

## 5. 예시: V-06 타일 보존 법칙 (완전 충족 케이스, 참조)

```markdown
### 게임 규칙 구현 6항목 체크리스트 (V-06 타일 보존)

- [x] (1) 문서 — `06-game-rules.md §6.4`
- [x] (2) 엔진 구현 — `engine/validator.go:91-97,111-119 validateTileConservation`
- [x] (3) 엔진 테스트 — `engine/conservation_test.go` 43건 (Happy + Negative 다수)
- [x] (4) UI 구현 — `GameClient.tsx` 서버 검증 트리거 (클라이언트는 전체 테이블 상태를 전송)
- [x] (5) E2E 테스트 — `e2e/game-rules.spec.ts` (Practice 모드 간접 커버)
- [x] (6) 추적성 매트릭스 — V-06 행 ✅ (§1)

종합: ✅ 완료
```

---

## 6. 운영 규칙 (의무화 시점)

- **2026-04-14 (Sprint 6 Day 3)부터 의무화**.
- 이후 게임 규칙 관련 PR은 본 체크리스트 없이 머지 금지 (리뷰어 차단).
- Sprint 7에서 `.gitlab-ci.yml` 에 `rule-matrix-check` job 도입 검토 — 매트릭스와 테스트 파일 정합성 자동 검증.
- 위반 사례 발생 시 `work_logs/retrospectives/` 에 사유 기록 + 다음 스탠드업 의제.

---

## 7. 참조

- `docs/04-testing/48-game-rule-coverage-audit.md` — 본 템플릿의 모태 감사 보고
- `docs/04-testing/52-19-rules-full-audit-report.md` — 19규칙 전수 재감사 결과
- `docs/02-design/31-game-rule-traceability.md` — 추적성 매트릭스 본체
- `docs/02-design/06-game-rules.md` — 규칙 정의서
- `docs/02-design/29-error-code-registry.md` — 에러 코드 레지스트리
- `work_logs/reviews/2026-04-10-game-server-review.md` §2.7.1 — `ErrNoRearrangePerm` orphan 발견
