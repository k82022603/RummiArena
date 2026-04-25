# A1~A21 행동 매트릭스 1:1 단위 테스트 (PR-D-Q02 RED)

- **작성**: 2026-04-25, qa Day 1 (RED 초안)
- **상위 SSOT**: `docs/02-design/56-action-state-matrix.md` §3.2~§3.19
- **상위 dispatch**: `work_logs/plans/2026-04-25-phase-c-implementation-dispatch.md` §3.4 PR-D-Q02
- **상위 산출물**: `docs/04-testing/88-test-strategy-rebuild.md` §2.1
- **목적**: 사용자 행동 21개 (A1~A21) × SSOT 56 매트릭스 셀 1:1 매핑 단위 테스트

## 파일 구조

```
by-action/
├── A01-rack-to-new-group.test.ts        (4 cases, A1)
├── A02-rack-to-pending.test.ts          (6 cases, A2)
├── A03-rack-to-server.test.ts           (6 cases, A3)
├── A04-pending-to-new.test.ts           (5 cases, A4)
├── A05-pending-to-pending.test.ts       (4 cases, A5)
├── A06-pending-to-server.test.ts        (6 cases, A6, INC-T11-DUP 회귀 핵심)
├── A07-pending-to-rack.test.ts          (4 cases, A7)
├── A08-server-to-new.test.ts            (4 cases, A8)
├── A09-server-to-server-merge.test.ts   (5 cases, A9, INC-T11-IDDUP 회귀 핵심)
├── A10-server-to-pending.test.ts        (4 cases, A10)
├── A11-server-to-rack.test.ts           (3 cases, A11)
├── A12-joker-swap.test.ts               (6 cases, A12)
├── A13-rack-rearrange.test.ts           (3 cases, A13)
├── A14-confirm-turn.test.ts             (7 cases, A14)
├── A15-reset-turn.test.ts               (3 cases, A15)
├── A16-draw.test.ts                     (4 cases, A16)
├── A17-cancel.test.ts                   (3 cases, A17)
├── A18-ws-place-tiles-from-other.test.ts (2 cases, A18)
├── A19-ws-turn-start.test.ts            (4 cases, A19)
├── A20-ws-turn-end.test.ts              (3 cases, A20)
└── A21-ws-invalid-move.test.ts          (4 cases, A21, INC-T11-FP-B10 회귀)

총 21 파일 / 90 cases (88 §2.1 합계 일치)
```

## RED → GREEN 전환 (G3 게이트)

**Day 1 (현재)**: 본 파일들은 모두 **RED** — describe/it 골격 + TODO 주석 + 룰 ID 매핑만.
실제 assertion 은 frontend-dev PR-D03~D08 (F-02~F-06) 의 reducer 재작성 후 작성.

**Day 2~3 (PR-D-Q02 RED commit)**: 본 RED 파일들에 실제 assertion 추가. CI RED 확인.

**Day 4 (PR-D-Q02 GREEN commit)**: frontend-dev PR-D03~D08 머지 후 본 테스트 GREEN 확인.

## SSOT 룰 ID 매핑 (G1 게이트)

각 파일의 모든 `describe` / `it` 명에 다음 패턴 1개 이상 포함:
- `V-[0-9]+[a-e]?` (서버 검증)
- `UR-[0-9]+` (UI 인터랙션)
- `D-[0-9]+` (데이터 무결성)
- `INV-G?[0-9]+` (invariant)
- `A[0-9]+` (행동 매트릭스 셀, 본 파일 자체)

## band-aid 금지 (G2 게이트)

본 디렉토리 어떤 테스트도 다음 검증 금지:
- `source.guard` / `sourceGuard` 동작
- `invariant.validator` 동작
- `BUG-UI-T11-INVARIANT` / `BUG-UI-T11-SOURCE-GUARD` 토스트 노출
- `detectDuplicateTileCodes` helper 사용 검증 (INV-G2 property test 제외)

## 모듈화 7원칙 (G5 게이트)

- **SRP**: 1 파일 = 1 셀 = 1 행동 (A-NN)
- **순수 함수 우선**: dragEndReducer 가 순수 함수가 되도록 검증
- **의존성 주입**: gameStore mock 주입
- **계층 분리**: UI / 상태 / 도메인 / 통신 4계층 명확
- **테스트 가능성**: describe/it 명에 SSOT 룰 ID 명시
- **수정 용이성**: 룰 1개 수정 시 1~3 파일만
- **band-aid 금지**: G2 통과
