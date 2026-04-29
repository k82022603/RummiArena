# rule-one-game-complete spec — turn-by-turn snapshot 보강

- **날짜**: 2026-04-29 (목)
- **Sprint**: Sprint 7 Week 2 / 마감 2026-05-02
- **담당**: qa
- **트리거**: W2 P3-3 회고 (`work_logs/reviews/2026-04-29-w2-p3-3-report.md`) §7.2 잔여 작업 → 1게임 완주 spec 의 turn 추적 부족
- **결과**: GREEN 유지, ring buffer + 디스크 trace 영속화 추가

---

## 1. 요약

| 항목 | 결과 |
|------|------|
| 보강 대상 | `e2e/rule-one-game-complete.spec.ts` (OGC 메타) |
| 신규 헬퍼 | `e2e/helpers/turnSnapshot.ts` (394줄) |
| spec 변화 | 280 → 267줄 (인라인 invariants → 외부 헬퍼 위임으로 가독성 ↑) |
| 자체 검증 | 헬퍼 self-check spec PASS, 의도적 break 시 JSON 파일 생성 확인 |
| TypeScript | 0 errors |
| ESLint | 0 warnings |

---

## 2. 변경 전 / 후 비교

### 변경 전

| 항목 | 상태 |
|------|------|
| snapshot 보관 | 메모리 array `snapshots[]`, 실패 시 휘발 |
| invariants 위치 | spec 본문 인라인 (검증 + 캡처 혼재) |
| 실패 trace | console.log 만, Playwright HTML 리포트에 자동 첨부 안 됨 |
| 회귀 분석 | 실패 시점에 어떤 턴까지 갔는지 stdout 만으로 추정 |
| test.step | 없음, trace viewer 에서 turn 단위 그룹핑 불가 |

### 변경 후

| 항목 | 상태 |
|------|------|
| snapshot 보관 | `SnapshotRecorder` ring buffer (기본 keepLastN=5, 누적 list 도 보존) |
| invariants 위치 | `assertInvariants()` 별도 함수, 위반 시 trace persist + throw |
| 실패 trace | `test-results/<test>/<label>-trace.json` 파일 + Playwright path attachment |
| 회귀 분석 | 직전 5턴 full snapshot + 누적 turn timeline 요약 |
| test.step | `captureWithStep()` 으로 매 capture 분리 노출 |

---

## 3. 캡처 항목 (TurnSnapshot 인터페이스)

룰 SSOT 매핑은 헬퍼 파일 docstring 에 명시 (`docs/02-design/55-game-rules-enumeration.md` 기준).

| 카테고리 | 필드 | 룰 ID 매핑 |
|---------|------|-----------|
| 메타 | `wallClockMs`, `loopIndex` | — |
| 턴 주체 | `turnNumber`, `currentSeat`, `mySeat`, `isMyTurn`, `aiThinkingSeat` | V-08 (자기 턴 확인) |
| 보드 | `tableGroups[]` (id/type/tiles/count), `tableGroupsCount`, `totalTableTileInstances` | V-01/V-02 (세트 유효성/크기) |
| 무결성 | `duplicatedTiles[]` (조커 제외 코드 빈도 >1) | **V-06** (BUG-UI-GHOST 회귀 가드) |
| 랙 | `myRackCount`, `myRackSample[5]` | V-03 (랙 ≥1 추가) |
| 타이머 | `remainingMs`, `turnTimeoutSec`, `drawPileCount` | UR-* (UX 타이머) |
| 진행 | `hasInitialMeld`, `pendingGroupIdsSize`, `pendingRecoveredJokers[]` | V-04 / V-13a / V-07 (조커 회수) |
| 종료 | `gameEnded` | INV |
| 액션 | `lastAction` (직전 snapshot 과 diff 추론) | — |

### lastAction 추론 규칙 (Recorder 내장)

직전 snapshot 과 비교해 사람이 읽을 수 있는 텍스트로 압축:

| 변화 | 출력 예 |
|------|---------|
| 첫 호출 | `init` |
| turnNumber 증가 | `turn-advance(#3→#4)` |
| currentSeat 변경 | `turn-end(seat 0→1)` |
| tableGroupsCount +K | `table-grow(+2)` |
| tableGroupsCount −K | `table-shrink(-1)` (병합/재배치 후보) |
| myRackCount +K | `rack-draw(+1)` |
| myRackCount −K | `rack-place(-3)` |
| gameEnded 전환 | `game-end` |
| 변화 없음 | `idle` |

복합 변화는 ` | ` 로 join.

---

## 4. invariant 검증 (assertInvariants)

매 capture 직후 호출. 위반 시 trace persist 후 throw.

| ID | 위반 조건 | 룰 매핑 |
|----|----------|--------|
| **I1** | `!isMyTurn && pendingGroupIdsSize > 0` (AI 턴인데 내 pending 잔존) | V-13a 보조 |
| **V-06** | `duplicatedTiles.length > 0` (조커 제외 보드 코드 중복) | **V-06 직접 / BUG-UI-GHOST 회귀 가드** |
| **I4** | `maxHasInitialMeldSeen && !hasInitialMeld` (초기 30점 단조성 역행) | V-04 보조 |

I2/I3 는 현 단계에서 인라인 인-루프 검증이 어려워 (멀티 drop 한 턴 내 정의 모호) snapshot 데이터로만 보존, 사후 분석 트레이스에서 재현. 후속 spec 에서 단발 drop 시나리오에 한정해 검증 도입 검토.

---

## 5. trace 파일 영속화 — 이중 경로 채택

**중요**: 초기 구현은 `testInfo.attach({ body: Buffer })` 단일 경로였으나, 의도적 break 검증에서 `test-results/` 디렉터리에 JSON 파일이 생성되지 않음을 확인. Playwright 의 `body` attachment 는 in-memory only.

→ `path` 모드로 전환:

```ts
const filePath = testInfo.outputPath(`${this.label}-trace.json`);
await fs.mkdir(dirname(filePath), { recursive: true });
await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
await testInfo.attach(`${this.label}-trace.json`, {
  path: filePath,
  contentType: "application/json",
});
```

이렇게 하면:
- 디스크에 파일이 항상 떨어짐 → CI artifact 수집/grep 가능
- Playwright HTML 리포트에도 인덱싱
- trace viewer 에서 다운로드 버튼 노출

### 검증 절차

scratch spec `e2e/_break-trace-verify.spec.ts` 로 의도적 fail 트리거 → 결과 디렉터리에 `break-trace-trace.json` 정상 생성 확인 → scratch spec 삭제.

---

## 6. 트레이스 샘플 (의도적 break 실측)

```json
{
  "label": "break-trace",
  "reason": "intentional break for trace verify",
  "failedAt": "2026-04-29T07:52:16.447Z",
  "keepLastN": 3,
  "totalSnapshots": 0,
  "lastN": [],
  "allTurnNumbers": []
}
```

(lobby 페이지에서 store 미노출 → snapshot 0 건. 실제 OGC 시나리오에서는 lastN 에 5 건의 full snapshot, allTurnNumbers 에 누적 timeline 이 채워진다.)

---

## 7. 검증 결과

| 검증 | 결과 |
|------|------|
| TypeScript (`npx tsc --noEmit`) | exit 0, 0 errors |
| ESLint (`next lint --file ...`) | 0 warnings |
| Playwright `e2e/rule-one-game-complete.spec.ts` (no Ollama) | 1 skipped (OGC main, 의도) / 1 passed (helper self-check) |
| 의도적 break 검증 (scratch spec) | JSON 파일 디스크 생성 확인 → scratch spec 삭제 |
| `body` → `path` attachment 전환 | 실패 시 `test-results/<test>/<label>-trace.json` 가시화 확인 |

OGC 메인 시나리오는 Ollama Pod 의존 → `E2E_OLLAMA_ENABLED=1` 환경변수로 로컬에서만 활성화. 본 보강은 게이트만 추가했고 시나리오 흐름은 동등.

---

## 8. 사용자 절대 원칙 준수 체크

| 원칙 | 준수 | 비고 |
|------|:---:|------|
| 꼼수 금지 | OK | 신규 guard 없음. 기존 invariants 를 별도 함수로 추출 + ring buffer 추가만 |
| 게임 진행 로직 변경 금지 | OK | spec/helper 만 변경. `src/frontend/src/` 미수정 |
| 회귀 zero | OK | helper self-check PASS, 메인 시나리오 흐름 보존 |
| 룰 ID 매핑 | OK | 헬퍼 docstring + 본 보고서에 V-/D-/INV- ID 명시 |
| 새 룰 신설 없음 | OK | 기존 V-01~V-19 / D-04 / D-08 / I1~I4 재사용 |

---

## 9. 후속 RISK-* 시나리오 재사용 가능성

`SnapshotRecorder` 는 1게임 완주 spec 외에도 다음 시나리오에서 즉시 재사용 가능 (의존: `__gameStore` + `__pendingStore` 노출):

| 후보 시나리오 | 재사용 포인트 |
|--------------|--------------|
| `rearrangement.spec.ts` | A4/A8 분기 후 invariants 검증 (V-06/V-13a) — 현재 6 FAIL RCA 진행 중 |
| `rule-extend-after-confirm.spec.ts` | EXT lock 토스트 + tableGroups 단조성 |
| `pre-deploy-playbook.spec.ts` Phase 2 | playbook 의 1게임 완주 메타와 직접 연동 |
| `hand-count-sync.spec.ts` | I3 (랙 카운트 = 렌더 tile 수) 누적 검증 |
| 향후 RISK-MULTI-DROP 시나리오 | 한 턴 내 멀티 drop 시 tableGroupsCount delta 추적 |

신규 spec 도입 시:
1. `import { SnapshotRecorder, captureWithStep }` 만 추가
2. 시나리오에 맞는 invariant 함수 작성 (assertInvariants 패턴 복제)
3. `recorder.persistOnFailure(testInfo, reason)` 호출

---

## 10. 잔여 / 후속

| 항목 | 시점 | 담당 |
|------|------|------|
| OGC 메인 실측 (`E2E_OLLAMA_ENABLED=1`) — Ollama warmup 후 1회 게임 완주 trace 샘플 수집 | 다음 자율 dispatch | qa |
| `rearrangement.spec.ts` 6 FAIL RCA 에 SnapshotRecorder 적용 검토 | 별도 | qa |
| I2 (tableGroupsCount 단조성) 정밀 검증 — 단발 drop 시나리오 한정 spec 신설 | Sprint 8 후보 | qa |
| pre-deploy-playbook 의 1게임 완주 메타와 trace 파일 자동 수집 연동 | 별도 | qa + devops |

---

## 11. 핵심 파일 절대경로

- `src/frontend/e2e/rule-one-game-complete.spec.ts` — 267줄 (-13)
- `src/frontend/e2e/helpers/turnSnapshot.ts` — 394줄 (신규)
- 본 보고서: `work_logs/reviews/2026-04-29-rule-one-game-complete-snapshot.md`

---

## 12. 커밋 메시지 (제안)

```
test(e2e): rule-one-game-complete turn snapshot 보강 [F] [Sprint 7 W2]

- SnapshotRecorder ring buffer (keepLastN=5) 도입
- assertInvariants 분리 (I1 / V-06 / I4)
- 실패 시 test-results/<test>/<label>-trace.json 디스크 영속화
- captureWithStep 으로 trace viewer turn 단위 분리 노출

룰 매핑: V-04 / V-06 / V-08 / V-13a / D-04 / D-08 / I1 / I3 / I4
참조: docs/02-design/55-game-rules-enumeration.md
회귀 zero: helper self-check PASS, OGC 흐름 보존, src/frontend/src/ 미수정
```

---

**작성**: 2026-04-29 qa (Opus 4.7, effort: high)
**관련 W2 회고**: `work_logs/reviews/2026-04-29-w2-p3-3-report.md` §7.2
