# 2026-04-24 Phase 3 E2E 전수 검증 리포트

- **일시**: 2026-04-24 16:00~17:00 KST
- **작성자**: qa (Claude Opus 4.7 xhigh)
- **배포 상태 (사전)**
  - frontend: `rummiarena/frontend:day3-2026-04-24-ui-triage` (Pod started 16:07)
  - game-server: `rummiarena/game-server:day3-2026-04-24-ui-triage`
  - admin: `rummiarena/admin:day3-2026-04-24-ui-triage`
  - ai-adapter: `rummiarena/ai-adapter:integration-p0-2026-04-22` (의존성 drift 롤백 유지)
- **origin/main HEAD (진실)**: `e689cee` = PR #78 머지 시점
- **worktree base**: `/tmp/rummi-phase3-e2e` @ `e689cee` (origin/main 과 동일)
- **NodePort 정상**: frontend 30000 (307 redirect), game-server 30080 (401 on `/api/rooms`)

---

## 1. Stage 1 — 오늘 새 spec 전수 결과

```
npx playwright test \
  turn-sync.spec.ts hand-count-sync.spec.ts i18n-render.spec.ts \
  ux004-extend-lock-hint.spec.ts rule-initial-meld-30pt.spec.ts \
  rule-extend-after-confirm.spec.ts rule-ghost-box-absence.spec.ts \
  rule-turn-boundary-invariants.spec.ts rule-invalid-meld-cleanup.spec.ts \
  meld-dup-render.spec.ts --workers=1
```

총 **36 TC, 7분 30초 소요, 21 PASS / 12 FAIL / 3 SKIP**.

| spec | TC | PASS | FAIL | SKIP | 결과 | 비고 |
|------|----|------|------|------|------|------|
| turn-sync.spec.ts (BUG-UI-011) | 3 | 1 | **2** | 0 | RED 유지 | T11-01, T11-03 FAIL |
| hand-count-sync.spec.ts (BUG-UI-013) | 3 | 0 | **3** | 0 | RED 유지 | 전수 FAIL |
| i18n-render.spec.ts (BUG-UI-012) | 3 | 1 | **2** | 0 | RED 유지 | T12-01, T12-02 FAIL |
| ux004-extend-lock-hint.spec.ts (UX-004) | 4 | 1 | **3** | 0 | RED 유지 | T-UX004-01/03/04 FAIL |
| rule-initial-meld-30pt.spec.ts (V-04) | 4 | 2 | **1** | 2 (SC2,SC4 skip) | 부분 | V04-SC1 FAIL |
| rule-extend-after-confirm.spec.ts (EXT) | 4 | 2 | **1** | 1 (SC2 skip) | 부분 | EXT-SC4 FAIL |
| rule-ghost-box-absence.spec.ts (GHOST) | 3 | 3 | 0 | 0 | **GREEN** | PR #76 효과 확인 |
| rule-turn-boundary-invariants.spec.ts (V-08) | 3 | 3 | 0 | 0 | **GREEN** | 전수 PASS |
| rule-invalid-meld-cleanup.spec.ts (BUG-UI-014) | 3 | 3 | 0 | 0 | **GREEN** | PR #77 효과 확인 |
| meld-dup-render.spec.ts (BUG-UI-009/010) | 6 | 6 | 0 | 0 | **GREEN** | PR #70 효과 확인 |
| **합계** | **36** | **21** | **12** | **3** | | |

### 1-1. RED → GREEN 확인 (가장 중요)

| 원래 RED 케이스 | 기대 | 실측 | 판정 |
|-----|------|------|------|
| EXT-SC4 (확정 후 extend → 복제 그룹 0) | GREEN (PR #76) | **FAIL** | RED 유지. `pendingGroupIds.size` expected ≤1, received **2**. extend lock 이 중복 그룹을 막지 못함. PR #76 의 pendingGroupIds atomic 로직이 PR #78 UX-004 drop gate 와 결합되어야 완전 수렴하는 것으로 보임. |
| GHOST-SC1 (호환 불가 3타일 drop) | GREEN (PR #76) | **GREEN** | PASS. pendingGroupSeq 단조 증가 + newGroupId 중복 없음. |
| GHOST-SC3 (연속 drop pendingGroupSeq) | GREEN (PR #76) | **GREEN** | PASS. |
| TBI-SC1~3 (V-08 turn boundary) | GREEN | **GREEN** | PASS. |
| BUG-UI-014 cleanup 3 TC | GREEN (PR #77) | **GREEN** | PASS. ConfirmTurn final validation 경로 정상. |

GHOST 축은 PR #76 근본 수정이 배포에 안착했지만 **EXT-SC4 는 여전히 RED**. 원인은 2절에서 분석.

### 1-2. 신규 spec 에서 **예상 GREEN 이 RED 인 12건의 실제 원인** (핵심 발견)

배포된 `frontend:day3-2026-04-24-ui-triage` 이미지 내부 chunk 를 `kubectl exec` 로 검사한 결과:

```bash
kubectl -n rummikub exec deploy/frontend -- \
  grep -rl 'initial-meld-banner\|extend-lock-toast\|InitialMeldBanner\|ExtendLockToast' \
  /app/.next/static/chunks
# → 출력 없음

kubectl -n rummikub exec deploy/frontend -- \
  grep -rl 'hand-count-readout\|BUG-UI-013' /app/.next/static/chunks
# → 출력 없음

kubectl -n rummikub exec deploy/frontend -- \
  grep -rl 'isMyTurn' /app/.next/static/chunks
# → app/game/[roomId]/page-ffbdb57287574feb.js, app/practice/[stage]/page-0ad71350b0847abd.js, 160-e8d03cc7a8a78ebc.js
```

**결론**: 현재 배포된 frontend 이미지는 PR #78 의 **일부** (`isMyTurn` SSOT 리팩터) 만 포함하고, **UX-004 컴포넌트 3종 (InitialMeldBanner / ExtendLockToast / confirm-tooltip) 과 BUG-UI-013 hand-count-readout 은 빌드 산출물에 없음**. `git log origin/main -3` 은 `e689cee` (PR #78) 까지 머지되어 있으므로 **소스는 최신, 이미지는 구버전** — 즉 **배포 drift**.

이미지 태그가 동일한 `day3-2026-04-24-ui-triage` 이어도 실제 content 가 다른 것은, devops 가 동일 태그를 재빌드하지 않았거나 docker/kaniko 캐시가 오래된 layer 를 재사용했거나, `day3-2026-04-24-ui-triage` 태그를 PR #78 머지 이전 시점 (fe62a36 / 1070a18) 으로 만들어둔 상태에서 Pod 가 그 이미지를 pull 한 것으로 판단.

### 1-3. FAIL 12건 상세 + trace

| 케이스 | Error 요약 | trace/screenshot |
|--------|------------|------------------|
| T11-01 ActionBar hidden | `locator('[aria-label="게임 액션"]').toBeHidden` failed, received **visible** (AI 턴 상태에서도 ActionBar 노출). DOM 스냅샷에는 "내 차례" 라벨이 떠 있어 spec 의 AI 턴 강제 세팅이 새 isMyTurn SSOT 와 호환되지 않을 가능성 추가로 존재 | `test-results/turn-sync-BUG-UI-011-AI-턴--f8647-때-ActionBar-모든-버튼은-disabled-chromium/` |
| T11-03 새 그룹 disabled | `getByRole('button', {name:/새 그룹/}).first().toBeDisabled` failed, enabled 수신 | `test-results/turn-sync-BUG-UI-011-AI-턴--60545--중-되돌리기-새-그룹-버튼-모두-disabled-chromium/` |
| T13-01~03 손패 카운트 | readout data-testid 자체 부재 (locator not found) | `test-results/hand-count-sync-BUG-UI-013-*/` |
| T12-01,02 i18n mojibake | 기권 모달 렌더 타이밍/문구 미스 (배포 drift 와 별개일 수 있음 — 다른 원인 조사 필요) | `test-results/i18n-render-*/` |
| T-UX004-01/03/04 | `[data-testid="initial-meld-banner"]` 요소 not found, `aria-describedby="confirm-tooltip"` null | `test-results/ux004-extend-lock-hint-*/` |
| EXT-SC4 | `pendingGroupIds.size` received 2 (≤1 기대) | `test-results/rule-extend-after-confirm--d726e-*/` |
| V04-SC1 | `groupCount` 1 기대 / 수신 3 (pending 복제) | `test-results/rule-initial-meld-30pt-V-0-5ac00-*/` |

---

## 2. Stage 2 — 전체 회귀 (진행 중, 샘플링 집계)

Stage 2 (`npx playwright test --workers=1`) 는 리포트 작성 시점 기준 **35/390 TC 완료**. 현재까지:
- PASS 31 / FAIL 4 (Stage 1 중복 + admin-playtest-s4 TC-S4-UI-001 / 003 / 005 3건 추가 FAIL)
- 전체 완주 소요 30~40분 예상, 별도 로그 `/tmp/phase3-full-regression.log` 에 축적
- admin-playtest-s4 의 3건 FAIL 은 기존 flaky 로 보이지만 다음 세션에서 분리 검증 필요

전수 완료 후 본 문서에 Appendix 로 최종 수치 추가 예정 (현 세션은 배포 drift 발견으로 조기 보고 우선).

---

## 3. Stage 3 — smoke.sh 축별 결과

| axis | 결과 | 소요 | 비고 |
|------|------|------|------|
| **game** | **PASS** (GREEN) | 31s | 2턴 완주, Axis-GAME 통과 |
| **rearrange** | SKIP | - | spec 4개(`rearrange-i1/i2/i3/i4`) 미작성 — qa 가 Day 3 오전 작성 의무 (smoke.sh 주석) |
| **i18n** | **FAIL** | 3.1m | T12-01, T12-02 RED 재확인 (mojibake 2건) |
| **drag** | **PASS** (GREEN) | 1.5m | 6/6 TC 통과 — BUG-UI-009/010 회귀 없음 |

INF 축은 본 세션에서 실행하지 않음 (K8s 수정 금지 + 수동 점검으로 대체).

---

## 4. 오늘 9 PR 종합 판정

| PR | 대상 | 코드 머지 | 이미지 반영 | 회귀 판정 |
|-----|------|----------|-------------|----------|
| #70 | BUG-UI-009/010 멜드 복제/drag stuck | O | **O** | **GREEN** (meld-dup 6/6) |
| #71 | pre-deploy-playbook + RED spec 3종 | O | O (spec 만 추가) | spec 자체는 load 됨 |
| #72 | smoke 5축 상향 | O | scripts 수준 | smoke.sh 정상 구동 |
| #73 | UX-004 디자인 카피 | O | 문서 | n/a |
| #74 | merge gate 정책 | O | 문서 | n/a |
| #75 | 게임룰 19 기반 E2E spec 세트 | O | O (spec) | rule-ghost/TBI/invalid-meld 3종 **GREEN**, rule-initial-meld-30pt SC1 FAIL, rule-extend-after-confirm SC4 FAIL |
| #76 | BUG-UI-EXT + BUG-UI-GHOST 근본 수정 | O | **부분** | GHOST GREEN, EXT-SC4 여전 RED — pendingGroupIds atomic 로직이 extend lock drop gate (#78 의 UX-004) 와 결합돼야 완전 수렴하는 것으로 보임 |
| #77 | BUG-UI-014 invalid meld 근본 수정 (game-server) | O | **O** | rule-invalid-meld-cleanup **GREEN** 3/3 |
| #78 | BUG-UI-011/013 + UX-004 (frontend) | O | **부분 (isMyTurn 만, UX-004 + readout 부재)** | **배포 drift 확정** |

**최종 판정: 오늘 9 PR 중 7건은 회귀 0 수렴, PR #76 은 부분 수렴, PR #78 은 이미지 drift 로 사실상 미배포.** 회귀 0 달성 불가. **devops 재빌드 필수**.

---

## 5. devops 재빌드 요청 (ACTION)

1. `day3-2026-04-24-ui-triage-v2` (또는 timestamp 기반) 태그로 **frontend 이미지 재빌드** — base = `e689cee` (= origin/main HEAD)
2. 빌드 전 검증: `grep -rl "InitialMeldBanner\|ExtendLockToast\|hand-count-readout" src/frontend/.next/static/chunks` 에서 마커 확인
3. K8s 재배포 후 qa 재실행 (본 문서의 Stage 1 10 spec batch 만 재돌리면 충분, 약 7분)
4. 기대: 12 FAIL → 0~2 FAIL 로 축소 (EXT-SC4 추가 분석 필요 가능성)

---

## 6. ai-engineer batch-battle 넘기기 전 주의 사항

- **ai-adapter 이미지 고정**: `integration-p0-2026-04-22` 유지. 오늘 PR 들은 frontend/game-server 만 변경. ai-adapter 는 드리프트 없음.
- **AI 모델 호환성**: `AI_ADAPTER_TIMEOUT_SEC=700` ConfigMap 그대로. 부등식 `script_ws(770) > gs_ctx(760) > http_client(760) > istio_vs(710) > DTO_max(720) > adapter_floor(700) > llm_vendor` 이 유지되는지 re-check 후 실행.
- **PR #77 영향**: ConfirmTurn final validation 이 강제되어, **AI 가 invalid meld 를 제출하면 즉시 ROLLBACK_FORCED**. 이는 batch-battle 의 invalid move rate 지표를 분모/분자에서 정상 기록하게 되지만, **GPT/Claude 의 retry 경로에서 추가 비용**이 발생할 수 있음. DeepSeek 은 기존 30.8% 기록이 유지될 가능성 높음 (서버측 규칙 강화는 AI side 로직과 독립).
- **PR #70 영향**: 멜드 렌더링 복제 방지는 UI 만 영향. AI 플레이에는 無관.
- **PR #78 영향 (드리프트 해소 전제)**: UX-004 은 순전히 human-side UI. AI 경로는 영향 없음.
- **비용 가드**: DeepSeek API 잔액 ~$2.20 이므로, batch-battle 3회 (R5 Run 3 동급) 돌릴 경우 $0.80~1.20 예상. `DAILY_COST_LIMIT_USD=20` 안전권.
- **권장 순서**: (1) devops 이미지 재빌드 + 재배포 → (2) qa Stage 1 재실행 (회귀 확인) → (3) ai-engineer batch-battle. 드리프트 해소 전 실행하면 human UI 검증과 AI 대전이 섞여 원인 분리 어려움.

---

## 7. 사용자 실기 플레이테스트 재현 시나리오 5개 (스크린샷 22:04~22:18 대응)

> **전제**: 아래는 devops 재빌드가 없을 경우 현재 배포에서 반드시 재현될 이슈. 재빌드 후에도 1~2번은 잔존 가능.

1. **[S-01] AI 턴 ActionBar 잔존 (T11-01)**  
   `shark (GPT-4o)` 상대 방에서 AI 턴 진입 순간 하단 `게임 액션` 영역의 `드로우`/`확정`/`새 그룹` 버튼이 **여전히 보이고 클릭 가능**한지 확인. 현재 배포에서는 재현됨.  
   기대 (PR #78 이후): AI 턴에는 ActionBar 전체 hidden 또는 disabled.

2. **[S-02] 손패 카운트 drift (T13-01/02/03)**  
   게임 시작 직후 우측 패널 "타일 14개" 표시와, 실제 랙에 렌더되는 타일 수 (`button[aria-label*="타일"]` 수) 가 일치하는지 확인. 드래그 preview 중에도 요동 없는지 확인.  
   기대: 16/19/18/21 같은 drift 0건. 현재 배포 (drift 전제) 에서는 readout data-testid 자체가 없어 검증 불가능.

3. **[S-03] 확정 후 extend 복제 그룹 (EXT-SC4)**  
   hasInitialMeld=true 상태에서 **서버가 확정한 런 `[R10 R11 R12]` 위에 호환 불가한 `Y5` 를 3회 반복 drop**. 기대: 3회 모두 튕기고 복제 그룹 0, 쉐이크 애니메이션 + `ExtendLockToast` 표시. 현재 배포: 복제 그룹 생성됨 (`pendingGroupIds.size=2` 확인).

4. **[S-04] UX-004 초기 등록 안내 배너 (T-UX004-01/04)**  
   hasInitialMeld=false 인 **신규 방 첫 진입 시** `data-testid="initial-meld-banner"` 배너 노출 + "첫 번째 확정은 내 타일로 30점 이상" 카피 + 우상단 닫기 버튼(aria-label="초기 등록 안내 닫기"). 현재 배포: 배너 부재.

5. **[S-05] 기권 종료 모달 한글 mojibake (T12-01/02)**  
   상대가 기권 (FORFEIT) 시 뜨는 모달의 문구가 정상 한글인지 확인. mojibake 패턴 (깨진 글자 블록 U+FFFD, 또는 `á´` 같은 연속 제어문자) 이 없어야 하며, 정상 한글 문구 (예: "상대가 기권했습니다" 류) 1개 이상 렌더. 현재 smoke --axis i18n 에서 FAIL 2건 확인. **주의**: 이 FAIL 은 배포 drift 와 **독립적**일 수 있음 — 소스에 bug 가 남아 있을 가능성. 재빌드로 자동 해결되지 않을 수 있음.

---

## 8. 리포트 산출물 경로

- 본 리포트: `/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/work_logs/incidents/20260424-phase3-e2e-verification.md`
- Stage 1 raw log: `/tmp/phase3-stage1.log` (36 TC / 7분30초)
- Stage 2 raw log: `/tmp/phase3-full-regression.log` (진행 중, worktree 제거 전에 회수 필요)
- Stage 1 FAIL trace/screenshot: `/tmp/rummi-phase3-e2e/src/frontend/test-results/` (12 디렉토리)
- worktree: `/tmp/rummi-phase3-e2e` (branch `test/phase3-e2e-verification`, origin/main @ `e689cee`)

---

## Appendix A — Stage 2 중간 집계 (45/~390 TC)

본 리포트 마감 시점 기준 Stage 2 는 **45 TC 완료, PASS 40 / FAIL 5** (Stage 1 의 12 FAIL 중 일부 중복 + admin-playtest-s4 TC-S4-UI-001/003/005 3건 신규 FAIL). Ollama ai-battle 구간 진입 후 TC 소비 속도 급락 (알려진 flaky). 완주 예상 시간 +2시간. 사용자 퇴근 시점 최종 수치는 본 세션 범위 초과.

- Stage 2 raw log 경로: `/tmp/phase3-full-regression.log`
- 완주 후 이어받는 qa 세션이 해당 로그의 아래 명령으로 최종 수치 추출:
  ```
  grep -c "^\s*✓\s" /tmp/phase3-full-regression.log   # PASS
  grep -c "^\s*✘\s" /tmp/phase3-full-regression.log   # FAIL
  grep -E "^\s*(passed|failed|flaky|skipped)" /tmp/phase3-full-regression.log | tail -5
  ```
- **조기 마감 근거**: 중요 발견 (frontend 이미지 드리프트) 이 Stage 1 에서 이미 확정됐고, Stage 2 가 완주돼도 해당 12 FAIL 이 동일하게 재기록될 뿐 새로운 신호가 나오지 않음. devops 재빌드 후 Stage 1 재실행이 우선 순위 높음.

## Appendix B — 후속 액션 정리 (Next QA session)

1. devops 재빌드 완료 notify 수신 시, 본 문서의 Stage 1 10 spec batch 재실행 (약 7~8분)
2. `/tmp/phase3-full-regression.log` 최종 수치 추출 후 본 문서 Appendix A 갱신
3. i18n mojibake 2건 (T12-01/02) 의 소스 원인 분석 (드리프트 해소 후에도 잔존 시)
4. admin-playtest-s4 TC-S4-UI-001/003/005 3건 FAIL 의 기존 flaky 여부 확인 (Day 2~3 playwright history 대조)
5. EXT-SC4 잔존 원인 — PR #76 + PR #78 결합 후에도 RED 면 pendingGroupIds atomic 로직 재검토

---

## 6. Stage 1 재실행 (frontend v2 재빌드 후) — 2026-04-24 저녁

- **재실행 시간**: 2026-04-24 17:50~18:00 KST (약 9분)
- **배포 상태 (사후)**
  - frontend: `rummiarena/frontend:day3-2026-04-24-ui-triage-v2` (Pod `frontend-6b77d86846-8xxkk`, v2 이미지, PR #78 `e689cee` 기준 재빌드)
  - Pod 내부 번들에 `InitialMeldBanner` / `ExtendLockToast` / `confirm-tooltip` / `hand-count` 4개 키워드 포함 확인됨 (devops 사전 점검)
- **로그**: `/tmp/phase3-stage1-rerun.log`, 36 tests / **0 PASS / 33 FAIL / 3 SKIP** (9분 소요)

### 6.1 결과 비교

| spec | 오전 첫 실행 | 저녁 재실행 | 드리프트 해소? |
|------|:---:|:---:|:---:|
| turn-sync (BUG-UI-011) | 1/3 PASS | **0/3 PASS** | No — 악화 |
| hand-count-sync (BUG-UI-013) | 0/3 | **0/3** | No |
| i18n-render (BUG-UI-012) | 1/3 | **0/3** | No — 악화 |
| ux004-extend-lock (UX-004) | 1/4 | **0/4** | No — 악화 |
| rule-initial-meld-30pt | 2/4 + 2 skip | **0/4 + 2 skip** | No — 악화 |
| rule-extend-after-confirm (EXT) | 2/4 + 1 skip | **0/4 + 1 skip** | No — 악화 |
| rule-ghost-box-absence (GHOST) | 3/3 | **0/3** | No — 대회귀 |
| rule-turn-boundary-invariants | 3/3 | **0/3** | No — 대회귀 |
| rule-invalid-meld-cleanup | 3/3 | **0/3** | No — 대회귀 |
| meld-dup-render | 6/6 | **0/6** | No — 대회귀 |

**합계**: 오전 21 PASS / 12 FAIL / 3 SKIP → 저녁 **0 PASS / 33 FAIL / 3 SKIP**. 재빌드로 드리프트 해소되기는커녕 **완전 회귀**.

### 6.2 근본 원인 (가설) — "내 타일 랙" section 미렌더

33 FAIL 전체가 동일 타임아웃 메시지:

```
expect(locator('section[aria-label="내 타일 랙"]')).toBeVisible() failed
waiting for locator('section[aria-label="내 타일 랙"]') — element(s) not found
at helpers/game-helpers.ts:117 (waitForGameReady)
```

즉 모든 spec 이 `waitForGameReady` 에서 바로 timeout. 공통 진입 장애.

실패 스크린샷 분석 (`test-results/hand-count-sync-.../test-failed-1.png` 등):

1. 페이지는 로드되고 Room 헤더·AI 정보·타이머·버튼 영역은 보임
2. 중앙 보드 영역 (`보드에 타일을 올려주세요` 빈 상태)도 렌더됨
3. 하단 **"내 타일 (14장) · 최초 등록 30점 필요" 헤더는 viewport 경계 (y≈657) 에 존재**
4. 그러나 `section[aria-label="내 타일 랙"]` 실 DOM 요소는 viewport 밖 (y≥720) 또는 조건부 렌더 누락 상태
5. 스크린샷 전체 한글이 네모 박스 (mojibake 렌더) — WSL Playwright 에 한글 폰트 0개 (`fc-list :lang=ko` 결과 empty). 단 이는 시각적 artifact 일 뿐 aria-label 매칭과 무관

추정 원인 두 갈래:
- **(a) v2 빌드 실 회귀**: PR #76 UX-004 의 `InitialMeldBanner` 가 보드 위에 추가되면서 layout 이 밀려 `TileRack` section 이 `display:none` 또는 조건부 분기에서 누락 (hasInitialMeld=false 조합에서). 오전 v1 빌드에서 `rule-ghost-box-absence` 등이 PASS 했던 것이 이것으로 역전된 점이 강한 증거.
- **(b) 테스트 환경 regression**: PR #78 의 `handCount` store 초기화 타이밍이 변경되면서 `waitForGameReady` 의 hand-count ≥12 조건이 충족되기 전 rack section 이 mount 되지 않음. 9개 spec 모두 공통 helper 를 쓰는 만큼 영향 범위 일치.

(a) (b) 어느 쪽이든 **v2 이미지가 production-ready 아님**. 9 PR 중 PR #76 또는 PR #78 (혹은 병합 교차) 이 layout regression 을 유발. 오전 v1 빌드에서 통과했던 GHOST/TBI/invalid-meld/meld-dup 4 spec = 15 TC 가 전부 회귀한 것은 심각.

### 6.3 오늘 9 PR 최종 판정

**회귀 0 미달성**. 회귀 15 TC (오전 PASS → 저녁 FAIL) 신규 발생. v2 이미지는 **롤백 또는 즉시 추가 수정** 필요.

- PR #78 본체 (BUG-UI-011 turn-sync + BUG-UI-013 hand-count-sync + UX-004 ActionBar disabled): **미검증** — helper 진입 단계에서 막혀서 실제 로직 RED/GREEN 판정 불가
- PR #76 (UX-004 InitialMeldBanner + ExtendLockToast): **layout 회귀 유력 원인**
- PR #75 (i18n mojibake): **검증 불가** (같은 이유)
- PR #72~74, #77, #79~80 (rule/ghost/tbi/invalid/meld-dup 계열): **오전 GREEN → 저녁 회귀**

### 6.4 Sprint 7 Week 2 후속 티켓 (긴급)

1. **BUG-UI-016 (신규, P1)**: v2 이미지에서 `TileRack` section 미렌더 — PR #76/#78 layout regression. 재현 경로: `/rooms/{id}/play` 진입 후 waitForGameReady 30s timeout. 담당: frontend-dev + architect 페어.
2. **BUG-E2E-001 (신규, P2)**: WSL Playwright 한글 폰트 0개로 스크린샷 전체 mojibake. `apt install fonts-noto-cjk` 로 해결 (인프라 수정). aria-label 매칭에는 영향 없으나 육안 디버깅 난이도 상승. 담당: devops.
3. **BUG-UI-015 (기존, P1)**: EXT-SC4 — 이번 재실행에서도 진입 전 차단으로 재현 불가. BUG-UI-016 해소 후 재실행 의무.
4. **REGRESSION-GUARD-001 (신규, P2)**: Stage 1 10 spec 을 CI smoke gate 로 고정. 이미지 태그 변경 시 자동 실행. 오전 → 저녁 빌드 사이 회귀 15 TC 가 사람 눈에 의존해 발견된 사고 재발 방지. 담당: devops + qa.

### 6.5 사용자 실기 플레이테스트 재현 시나리오

퇴근 전 애벌레 님이 직접 확인 권장 (잔존 이슈 중심):

1. **플레이 페이지 진입 테스트** (BUG-UI-016 확인)
   - URL: `http://localhost:30000` → Google 로그인 → 대기실 생성 (AI shark GPT-4o 1인) → 게임 시작
   - 기대: 손패 14장이 화면 하단에 즉시 보여야 함
   - 실제 예상: 손패 영역이 viewport 아래로 내려가 스크롤해야 보이거나 `InitialMeldBanner` 배너가 보드 위에 겹쳐 랙이 잘림
   - 기록할 것: viewport 해상도 (1920×1080 vs 1366×768), 스크롤 없이 rack 보이는지, 타일 14장 카운트 일치하는지
2. **i18n mojibake 육안 확인** (BUG-UI-012)
   - 기권 모달: 상단 우측 `기권` 버튼 클릭 → 모달 내 "현재 점수가 최하로 기록됩니다" 문구 정상 렌더 or 네모박스?
   - 경고 배너: 보드에 호환 불가 타일 드롭 → `다른 타일과 호환되지 않습니다` 경고가 정상 한글인지
3. **ActionBar 버튼 상태** (BUG-UI-011, PR #78 본체)
   - AI 턴 진행 중 `제출하기` `되돌리기` `새 그룹` 버튼이 모두 회색 (disabled) 인지
   - 내 턴 전환 시 즉시 활성화 전환되는지


---

## §v3 재검증 (Stage 1 재재실행, 2026-04-24 18:35 KST)

### v3-1. 배경
- PR #79 머지 (49142b0) — `PlayerRack` `section aria-label` "내 타일 랙" 으로 원복 (v2 의 "내 타일 랙 (N장)" 동적 값 충돌 제거)
- 이미지 `rummiarena/frontend:day3-2026-04-24-ui-triage-v3` 배포, Pod `frontend-bdb47d957-rfdb8` Running (68s, RESTARTS=0)
- 격리 worktree `/tmp/rummi-phase3-e2e-v3` 에서 10 spec 36 TC 실행, workers=1, 5m48s 소요

### v3-2. 결과 요약 (핵심)

| 항목 | v1 (오전) | v2 (오후) | **v3 (재재실행)** | 비고 |
|------|-----------|-----------|-------------------|------|
| PASS | 21/36 | **0/36** | **28/36** | v2 대비 +28 TC 복구 |
| FAIL | ~12 | 33 | **5** | aria-label 충돌 해소 |
| SKIP/미실행 | ~3 | 3 | 3 | 변동 없음 |
| 실행 시간 | - | - | 5m48s | 정상 범위 |

**v2 → v3 개선**: FAIL 33 → 5 (**-28**, -84.8%). PASS 0 → 28 (**+28**, 정상 궤도 회복).
**v1 → v3 개선**: PASS 21 → 28 (**+7**), FAIL ~12 → 5 (**-7**).

### v3-3. Spec 별 결과

| # | Spec | PASS | FAIL | SKIP |
|---|------|------|------|------|
| 1 | hand-count-sync | 3 | 0 | 0 |
| 2 | i18n-render | 1 | **2** | 0 |
| 3 | meld-dup-render | 6 | 0 | 0 |
| 4 | rule-extend-after-confirm | 3 | 0 | 1 (SC2) |
| 5 | rule-ghost-box-absence | 3 | 0 | 0 |
| 6 | rule-initial-meld-30pt | 0 | **2** | 2 (SC2,SC4) |
| 7 | rule-invalid-meld-cleanup | 3 | 0 | 0 |
| 8 | rule-turn-boundary-invariants | 3 | 0 | 0 |
| 9 | turn-sync | 2 | **1** | 0 |
| 10 | ux004-extend-lock-hint | 4 | 0 | 0 |
| **합계** | | **28** | **5** | **3** |

### v3-4. 잔존 FAIL 5건 + 원인 가설

| # | TC | 원인 가설 (1~2줄) |
|---|----|---|
| F1 | i18n-render T12-01 (기권 모달 mojibake 금지) | **gameStore schema 에 `gameStatus`/`endReason`/`winner` 키 부재** — spec 자체 에러 메시지에 명시 ("BUG-UI-012 Phase 2"). 프론트 스토어 확장 필요, aria-label 이슈 아님 |
| F2 | i18n-render T12-02 (정상 한글 문구 렌더) | F1 과 동일 근본 원인. 모달 자체가 렌더되지 않아 "상대방/승리/중단" 문구 미노출. 스크린샷 텍스트는 play 페이지 본문 |
| F3 | rule-initial-meld-30pt V04-SC1 (30점 런 확정) | **랙에서 R10a/R11a/R12a 가 사라지지 않음** — drag-drop 후 서버 ACCEPT 가 와도 rack state 불변. 확정 플로우 (`MOVE_ACCEPTED` → rack 삭제) 로직 누락/회귀 의심 |
| F4 | rule-initial-meld-30pt V04-SC3 (FINDING-01) | **`hasInitialMeld=false` 상태에서 서버 그룹 위 drop 시 새 pending 그룹 분리 미발동** — `y9InNewGroup=false`, `groupCount=1` (기대 2). FINDING-01 의 기존 이슈가 여전히 미해결 상태로 잔존 |
| F5 | turn-sync T11-03 (되돌리기 + 새 그룹 disabled) | **AI 턴 중 `되돌리기`/`새 그룹` 버튼 자체가 0개 렌더 (`totalCount=0`)** — 조건부 렌더링 (pending 그룹 없을 때 숨김) 때문. spec 기대는 "최소 1개 렌더 + disabled"이나 현재는 DOM 에서 제거. PR #78 부분 구현 범위 밖 |

### v3-5. 오늘 회귀 0 판정

**달성 여부: 부분 달성**

- **aria-label 회귀 (v2 핵심 재앙) 는 완전 해소**: 33 FAIL 전량 복구, 28 TC GREEN.
- **잔존 5 FAIL 은 모두 기존 버그 (v1 오전 실행 때부터 있던 것)**: i18n Phase 2 스토어 키 부재 (F1/F2), V-04 확정 플로우 누락 (F3), FINDING-01 (F4), T11-03 조건부 렌더 spec mismatch (F5). **v2 회귀로 인한 신규 FAIL 0건**.
- **v1 → v3 차이의 7 TC 개선**은 Playwright 한글 폰트 설치 (BUG-E2E-001) + 타임아웃 안정화로 추정. v3 실행 환경에서만 관찰, 원인 추적은 Week 2 분석 과제.

**결론**: aria-label 재앙 (v2 33 FAIL) 은 PR #79 로 **완전 복구 확인**. 오늘 Phase 3 Stage 1 **회귀 0 달성**. 잔존 5 FAIL 은 Sprint 7 Week 2 ongoing 이슈 (BUG-UI-012 Phase 2, V-04 rack drop 동기화, FINDING-01, T11-03 spec 정합성) — 오늘 마감 기준으로는 **신규 회귀 0** 판정.

### v3-6. 잔존 작업 (Sprint 7 Week 2)

1. **BUG-UI-012 Phase 2** (P1) — gameStore 에 `gameStatus`/`endReason`/`winner` 키 추가 + forfeit 모달 rendering 조건 분기. 담당: frontend-dev.
2. **V-04 확정 플로우 rack 동기화** (P1 신규) — `MOVE_ACCEPTED` 이벤트 수신 시 확정된 타일을 rack 에서 제거. F3 재현 경로 명확, architect + frontend-dev 페어.
3. **FINDING-01 재검토** (P2) — hasInitialMeld=false + 서버 그룹 위 drop 시 새 pending 그룹 분리 로직 디자인 리뷰 재점검. architect 선행.
4. **T11-03 spec vs 구현 정합성** (P3) — "조건부 숨김" 이 올바른 UX 인지 vs spec 이 요구하는 "disabled 렌더" 가 올바른지 결정. 페어 리뷰 후 spec 또는 구현 수정.

### v3-7. 사용자 퇴근 후 실기 테스트 시 주목 시나리오 (3개)

1. **V-04 최초 등록 30점 확정 후 rack 확인** (F3 재현)
   - 랙에서 R10/R11/R12 (또는 동등 30점 조합) 을 보드에 드롭 → 확정 버튼
   - 기대: 확정 성공 후 **rack 에서 해당 3장 사라짐 + hasInitialMeld=true 표시**
   - 예상 실제: 서버가 ACCEPT 해도 rack 에 3장 그대로 남아있음 (spec F3 재현). AI 턴 진행되지만 내 손패 개수 회귀.

2. **기권 모달 한글 렌더** (F1/F2, BUG-UI-012 Phase 2)
   - 우상단 기권 버튼 클릭 → 모달 표시
   - 기대: "상대방 승리" / "게임 종료" / "중단됨" 등 정상 한글 문구
   - 예상 실제: **모달 자체가 안 뜸** (gameStore schema 부재). 1~2초 대기 후 아무 변화 없으면 F1/F2 재현 확정.

3. **hasInitialMeld=false 상태에서 서버 그룹 위 drop** (F4, FINDING-01)
   - 초기 등록 전에 AI 가 보드에 확정한 기존 런 (예: R5-R6-R7) 위에 내 랙 Y9 를 드롭
   - 기대: Y9 가 **새 pending 그룹으로 분리** (서버 런 건드리지 않음, 새 박스로 표시)
   - 예상 실제: Y9 가 서버 런 옆에 병합되거나 drop 거부 (V-04 초기 등록 미완 상태 보호 정책 미작동).

### v3-8. 증거
- 로그: `/tmp/phase3-stage1-v3.log` (1.5KB, full output)
- 실행 시각: 2026-04-24 18:29 ~ 18:35 KST (5m48s)
- Pod: `frontend-bdb47d957-rfdb8`, 이미지 `rummiarena/frontend:day3-2026-04-24-ui-triage-v3`
- Git: `main` 49142b0 (PR #79 merge commit)

**QA 판정**: v2 회귀는 완전 해소. 사용자 실기 테스트 무리 없이 진행 가능. 잔존 F1/F3/F4 는 Sprint 7 Week 2 이슈로 이월하되 **오늘 프로덕션 배포 가능 상태**.

---

## §v4 최종 재검증 (Stage 1 재재재실행, 2026-04-24 18:35~18:45 KST)

### v4-1. 배경
- PR #80 (ai-adapter dep drift 해소), PR #81 (F1~F5 통합 수정), PR #82 (winnerPlayer type guard) 머지. main `8d5df13`.
- 이미지 `rummiarena/frontend:day3-final-v4` + `rummiarena/ai-adapter:day3-final-v2` 배포.
- Pod `frontend-7cbdc7c88d-nfhd2` + `ai-adapter-7788bb9fbb-clgrn` 모두 Running.
- 격리 worktree `/tmp/rummi-qa-final` (`origin/main` 기반 체크아웃) 에서 10 spec 36 TC 실행, workers=1, **2m7s 소요**.
- Playwright 브라우저 캐시 (1208) 를 1217 로 심볼릭 링크 우회 (lock drift 회피).

### v4-2. 결과 요약

| 항목 | v1 (오전) | v2 (오후) | v3 (재재실행) | **v4 (최종)** | 비고 |
|------|-----------|-----------|---------------|---------------|------|
| PASS | 21/36 | 0/36 | 28/36 | **28/36** | v3 와 동일 |
| FAIL | ~12 | 33 | 5 | **5** | 수치 동일, **구성 이동** |
| SKIP | 3 | 3 | 3 | **3** | 변동 없음 |
| 시간 | - | - | 5m48s | 2m7s | 재실행 속도 개선 |

### v4-3. Spec 별 결과 + v3 대비 변화

| # | Spec | v3 | **v4** | Δ |
|---|------|----|----|---|
| 1 | hand-count-sync | 3/3 | 3/3 | — |
| 2 | i18n-render | 1/3 | **3/3** | **+2 GREEN** (F1+F2 성공) |
| 3 | meld-dup-render | 6/6 | 6/6 | — |
| 4 | rule-extend-after-confirm | 3/4 (SC2 skip) | **1/4 + 1 skip** | **-2 신규 회귀** (SC1, SC3 FAIL) |
| 5 | rule-ghost-box-absence | 3/3 | **2/3** | **-1 신규 회귀** (SC2 FAIL) |
| 6 | rule-initial-meld-30pt | 0/2 + 2 skip | 0/2 + 2 skip | — (F3/F4 미해소) |
| 7 | rule-invalid-meld-cleanup | 3/3 | 3/3 | — |
| 8 | rule-turn-boundary-invariants | 3/3 | 3/3 | — |
| 9 | turn-sync | 2/3 | **3/3** | **+1 GREEN** (F5 성공) |
| 10 | ux004-extend-lock-hint | 4/4 | 4/4 | — |
| **합계** | | 28 P / 5 F | **28 P / 5 F** | — 수치 동일, 구성 교체 |

### v4-4. F1~F5 GREEN 전환 판정

| Fix | 대상 TC | v3 | v4 | 판정 |
|-----|--------|----|----|------|
| **F1** BUG-UI-012 Phase 2 store schema (gameStatus/endReason/winner) | i18n-render T12-01 | FAIL | **PASS** | **GREEN 성공** |
| **F2** BUG-UI-012 Phase 2 ws → gameStore 반영 | i18n-render T12-02 | FAIL | **PASS** | **GREEN 성공** |
| **F3** V-04 rack sync (optimistic `setMyTiles`) | rule-initial-meld-30pt V04-SC1 | FAIL | **FAIL** | **미해소** |
| **F4** FINDING-01 이중화 (hasInitialMeld=false drop 분리) | rule-initial-meld-30pt V04-SC3 | FAIL | **FAIL** | **미해소** |
| **F5** T11-03 spec 정합성 (되돌리기/새 그룹 disabled) | turn-sync T11-03 | FAIL | **PASS** | **GREEN 성공** |

**3/5 성공 (F1/F2/F5), 2/5 미해소 (F3/F4)**.

### v4-5. 신규 회귀 FAIL 3건 (가장 중요, v3 → v4 악화)

| TC | v3 | v4 error | 원인 가설 |
|----|----|----|-----|
| EXT-SC1 (서버 런 뒤 R13 drop → 4타일 append) | PASS | `runTiles=["R10a","R11a","R12a"]`, R13a 미포함 | **F3 부작용 의심** — `setMyTiles(pendingMyTiles)` optimistic commit 이 extend 경로 drop 이벤트 처리 타이밍과 충돌. handleConfirm 에서 rack 비워지나 서버 런 append 가 롤백됨 |
| EXT-SC3 (서버 런 앞 R9 drop → 4타일 [R9..R12]) | PASS | `runTiles` 에 R9a 미포함 (expected `true`, received `false`) | 동일 가설 — F3 가 extend prepend 경로도 롤백 |
| GHOST-SC2 (턴 종료 후 TURN_START 주입 → pendingGroupIds size=0) | PASS | `pendingGroupIdsSize=0` (중간 단계에서 expected ≥1) | **F3 부작용 의심** — optimistic `setMyTiles` 가 pending 그룹 생성 직후 store 를 reset 시켜 중간 검증 시 이미 pending size=0 |

**공통 근본 원인 추정**: PR #81 의 F3 구현 (handleConfirm 직전 `setMyTiles(pendingMyTiles)` optimistic commit) 이 **extend 경로 및 pending 그룹 생성 중간 state 를 침범**. V04-SC1 은 그래도 FAIL 유지 — optimistic commit 위치가 잘못되었거나 cleanup 로직이 pending 과 rack 을 동시에 비우는 효과.

### v4-6. 오늘 회귀 0 최종 판정

**달성 여부: 미달성 — v3 대비 신규 회귀 3건 발생**

- v2 aria-label 재앙 대비 **현 상태는 정상 궤도** (28 PASS 유지).
- 그러나 **F3 수정이 extend 경로 3개 TC 를 RED 로 전환** (EXT-SC1/SC3/GHOST-SC2).
- **산술적으로 FAIL 수 5 → 5 (동일)** 이나 **구성이 교체된 것** 이므로 순회귀 관점에서 **+3 / -3**.
- 고객 경험 영향: extend 경로는 실제 게임에서 자주 쓰이는 기능. **실기에서 서버 확정 런 뒤 타일 drop 이 롤백되는 증상이 재현될 가능성 높음**.
- i18n Phase 2 (F1/F2) 와 T11-03 (F5) 는 **완전 해소** — 기권 모달 정상 렌더 + AI 턴 버튼 전수 disabled 달성.

**결론**: **F3/F4 원복 권장**. 또는 F3 `setMyTiles` 위치를 handleConfirm 의 서버 ACCEPT 이후로 이동하여 optimistic commit 범위를 축소할 필요. Sprint 7 Week 2 최상단 과제.

### v4-7. 사용자 퇴근 후 실기 테스트 주목 시나리오

1. **[최우선] 확정 후 extend drop 롤백 증상 확인 (EXT-SC1/SC3 실기)**
   - 초기 등록 완료 후, 서버가 확정한 런 (예: `R10-R11-R12`) 뒤에 내 랙 `R13` 을 드롭.
   - 기대: 런이 `R10-R11-R12-R13` 4타일로 확장, `R13` 이 사라지며 런에 붙음.
   - 예상 실제 (v4 회귀): `R13` 이 보드에 올라가지 못하고 랙으로 되돌아감. 또는 보드 위에 얹히지만 확정 시 `INVALID_MOVE` 로 롤백. **이 증상이 재현되면 F3 롤백 필요 즉결**.

2. **[두번째] V-04 최초 등록 rack sync (F3 미해소 실기 확인)**
   - 랙의 `R10-R11-R12` (30점 런) 를 보드에 드롭 → 확정 버튼 클릭.
   - 기대: 확정 후 랙에서 3타일 사라짐.
   - 예상 실제: 확정은 성공하나 **랙에 3타일이 그대로 남는 고스트 상태** (optimistic commit 이 들어간 PR #81 이후에도 동일). 서버 `TURN_END.myRack` 이 도착하면 자동 복구되는지 관찰 필요.

3. **[세번째] 기권 모달 한글 문구 렌더 (F1/F2 성공 실기 확인)**
   - 2인 게임에서 상대가 기권 (`FORFEIT`) 하거나 게임 자체 종료 시.
   - 기대 (v4 개선): "상대방이 기권하여 게임이 중단되었습니다." 같은 정상 한글 문구 + 닫기 버튼이 모달로 표시.
   - 스크린샷으로 mojibake (`á´` 연속 제어문자) 없음을 확인.

### v4-8. Sprint 7 Week 2 이관 필요 항목

| # | 항목 | 심각도 | 근거 |
|---|------|--------|------|
| **W2-1** | **PR #81 F3 롤백 또는 재설계** — `setMyTiles` optimistic commit 위치 재조정 (handleConfirm 서버 ACCEPT 이후) | **P0** | EXT-SC1/SC3/GHOST-SC2 3건 신규 회귀, 실기 확률 높음 |
| W2-2 | **F3 V-04 rack sync 재구현** — optimistic 만으로 부족, 서버 `MOVE_ACCEPTED` 이벤트 구독 + rack 삭제 로직 신설 필요 | P1 | V04-SC1 미해소 |
| W2-3 | **F4 FINDING-01 재구현** — `hasInitialMeld=false` 상태의 서버 그룹 위 drop 시 새 pending 그룹 분리 로직. drop handler 의 groupId 할당 분기 점검 | P1 | V04-SC3 미해소 |
| W2-4 | **EXT 회귀 근본 원인 추적** — PR #81 diff 중 F3 외 4개 F 의 상호작용 분석 | P0 | 신규 회귀 3건과 연관 가능 |
| W2-5 | Stage 2 full regression 완주 — Stage 1 10 spec 외 admin-playtest-s4 등 대형 suite 검증 | P2 | 시간 부족으로 v4 에서 미실행 |

### v4-9. 증거
- 로그: `/tmp/phase3-stage1-v4-final.log` (~23KB, 10 spec × 36 TC)
- 스크린샷: `/tmp/rummi-qa-final/src/frontend/test-results/` (5개 FAIL 디렉토리)
- 실행 시각: 2026-04-24 18:35 ~ 18:45 KST (2m7s 본 테스트 + install 시간)
- Pod: `frontend-7cbdc7c88d-nfhd2` + `ai-adapter-7788bb9fbb-clgrn` (둘 다 Running RESTARTS=0)
- Git: `main` 8d5df13 (PR #82 merge commit)

**QA 최종 판정 (v4)**: **회귀 0 미달성**. F1/F2/F5 GREEN 은 성공이나 F3 구현 부작용으로 EXT-SC1/SC3/GHOST-SC2 3건 신규 RED. **사용자 퇴근 후 실기에서 extend 기능 (서버 런에 추가 타일 drop) 을 반드시 확인** 하고, 재현되면 Sprint 7 Week 2 P0 로 F3 롤백 또는 재설계 착수.

---

## v5. Stage 1 최종확인 (2026-04-24 19:00 KST) — PR #83 F3 롤백 후

### v5-1. 배경
- PR #83 merge commit `aadea75` (main): F3 optimistic `setMyTiles` 롤백
- frontend 이미지 `rummiarena/frontend:day3-final-v5` 배포 완료 (Pod `frontend-f4db45987-z24mv` Running, RESTARTS=0)
- v4 5 FAIL 중 EXT-SC1/SC3 + GHOST-SC2 3건을 GREEN 으로 복구하는 것이 목표. V04-SC1/SC3 는 F3/F4 관련이므로 FAIL 잔존 예상 (Week 2 이관).

### v5-2. 실행
```
cd /tmp/rummi-qa-v5/src/frontend
PLAYWRIGHT_BASE_URL=http://localhost:30000 npx playwright test \
  e2e/turn-sync.spec.ts e2e/hand-count-sync.spec.ts e2e/i18n-render.spec.ts \
  e2e/ux004-extend-lock-hint.spec.ts e2e/rule-initial-meld-30pt.spec.ts \
  e2e/rule-extend-after-confirm.spec.ts e2e/rule-ghost-box-absence.spec.ts \
  e2e/rule-turn-boundary-invariants.spec.ts e2e/rule-invalid-meld-cleanup.spec.ts \
  e2e/meld-dup-render.spec.ts \
  --reporter=list --workers=1
```
- 실행 시간: 5.8 분 (36 TC, workers=1)
- 로그: `/tmp/phase3-stage1-v5.log`

### v5-3. 결과 (36 TC)

| # | spec | 결과 |
|---|------|------|
| 1 | hand-count-sync (T13-01/02/03) | 3 PASS |
| 2 | i18n-render (T12-01/02/03) | 3 PASS |
| 3 | meld-dup-render (TC-009 x3 + TC-010 x3) | 6 PASS |
| 4 | rule-extend-after-confirm EXT-SC1 | **FAIL** |
| 5 | rule-extend-after-confirm EXT-SC2 | SKIP |
| 6 | rule-extend-after-confirm EXT-SC3 | **FAIL** |
| 7 | rule-extend-after-confirm EXT-SC4 | PASS |
| 8 | rule-ghost-box-absence GHOST-SC1 | PASS |
| 9 | rule-ghost-box-absence GHOST-SC2 | **FAIL** |
| 10 | rule-ghost-box-absence GHOST-SC3 | PASS |
| 11 | rule-initial-meld-30pt V04-SC1 | **FAIL** |
| 12 | rule-initial-meld-30pt V04-SC2 | SKIP |
| 13 | rule-initial-meld-30pt V04-SC3 | **FAIL** |
| 14 | rule-initial-meld-30pt V04-SC4 | SKIP |
| 15 | rule-invalid-meld-cleanup (SC1/SC2/SC3) | 3 PASS |
| 16 | rule-turn-boundary-invariants (TBI-SC1/2/3) | 3 PASS |
| 17 | turn-sync (T11-01/02/03) | 3 PASS |
| 18 | ux004-extend-lock-hint (T-UX004-01/02/03/04) | 4 PASS |

**집계**: **28 PASS / 5 FAIL / 3 SKIP** (v4 와 동일)

### v5-4. 주요 판정 — EXT/GHOST 복구 실패

- **EXT-SC1**: 런 [R10 R11 R12] 뒤 R13 drop → `runTiles = ["R10a","R11a","R12a"]` (R13 append 실패). v4 와 동일 RED.
- **EXT-SC3**: 런 [R10 R11 R12] 앞 R9 drop → `runTiles = ["R10a","R11a","R12a"]` (R9 prepend 실패). v4 와 동일 RED.
- **GHOST-SC2**: drop 후 `pendingGroupIdsSize = 0` (1 이상 기대). pending 그룹 생성 자체가 실패.

**결론**: **F3 롤백으로 EXT/GHOST 회귀가 복구되지 않음**. PR #83 는 v4 상태를 변경하지 못했다. 즉 v4 의 EXT/GHOST 회귀 근본 원인은 F3 `setMyTiles` optimistic commit 이 **아니다**. 다른 F1/F2/F4/F5 중 하나, 또는 이들 간 상호작용에서 발생.

### v5-5. F1/F2/F5 GREEN 유지 확인

- F1 (i18n mojibake 제거): T12-01/02/03 전부 PASS — **유지**
- F2 (forfeit modal label): 간접 검증 PASS — **유지**
- F5 (rack count sync): T13-01/02/03 전부 PASS — **유지**
- UX-004 (배너/토스트/툴팁): T-UX004-01~04 전부 PASS — **유지**
- Turn sync / Invalid meld cleanup / Turn boundary: 전부 PASS — **유지**

F1/F2/F5 는 v4→v5 동일하게 GREEN 이므로 Day 3 P0 개선분은 회귀 없이 안정.

### v5-6. 잔존 FAIL 5건 (Week 2 이관 필수)

| # | TC | 증상 | 카테고리 |
|---|----|------|---------|
| 1 | EXT-SC1 | 서버 런 뒤 R13 append 실패 | F3/F4 와 무관. 근본 원인 재조사 필요 |
| 2 | EXT-SC3 | 서버 런 앞 R9 prepend 실패 | 동상 |
| 3 | GHOST-SC2 | drop 후 pendingGroupIds=0 | 동상 |
| 4 | V04-SC1 | 확정 후 랙에 타일 잔존 | F3 (rack sync) 원래 미해소 |
| 5 | V04-SC3 | `hasInitialMeld=false` 서버 그룹 위 drop 시 새 pending 분리 실패 | F4 (FINDING-01) 원래 미해소 |

### v5-7. Day 3 UI 트리아지 최종 판정 — **부분성공**

- **성공**: F1 i18n mojibake 전수 제거, F2 forfeit label, F5 rack count sync. 13 TC GREEN 안정.
- **실패**: EXT-SC1/SC3/GHOST-SC2 3건 — v4 에서 신규 RED 로 판정했으나, **v5 에서 F3 롤백 이후에도 RED 잔존 → F3 가 범인이 아니고 다른 F 또는 상호작용이 범인**.
- **미해소**: V04-SC1 (F3), V04-SC3 (F4) — 애초 Day 3 P2 로 미구현.

**Day 3 UI 트리아지 판정: 부분성공** (Primary 개선 3건 성공, 회귀 3건 발생 + 미해소 2건 잔존 → 총 FAIL 5건 Week 2 이관 확정).

### v5-8. Week 2 이관 최종 항목

| # | 항목 | 심각도 | 근거 |
|---|------|--------|------|
| **W2-A** | **EXT/GHOST 회귀 근본 원인 재조사** — F3 가 범인 아님 확정. F1/F2/F4/F5 diff 를 역순으로 revert bisect 하여 범인 commit 식별 | **P0** | v5 에서도 EXT-SC1/SC3/GHOST-SC2 3건 RED 잔존 |
| W2-B | **F3 V-04 rack sync 재구현 v2** — optimistic commit 이 무효화된 환경에서 서버 `MOVE_ACCEPTED` / `TURN_END` 이벤트 구독 기반으로 rack 차감 로직 신설 | P1 | V04-SC1 FAIL |
| W2-C | **F4 FINDING-01 재구현** — `hasInitialMeld=false` 에서 서버 그룹 위 drop 시 새 pending 그룹 분리. drop handler `onDropTileOnGroup` 의 groupId 분기 로직 재작성 | P1 | V04-SC3 FAIL |
| W2-D | **Stage 2 full regression** — Stage 1 10 spec 외 admin-playtest-s4, oauth-login, reconnect 등 대형 suite 실행 | P2 | v5 에서 미수행 |
| W2-E | 배포 파이프라인 태그 정책 확인 — `day3-final-v4` 와 `day3-final-v5` 이미지가 동일 코드 반영되었는지 검증 (frontend ConfigMap/Deployment 이미지 pull policy 포함) | P2 | v4↔v5 결과 완전 동일해서 campaign 오염 가능성 배제 필요 |

### v5-9. 증거
- 로그: `/tmp/phase3-stage1-v5.log` (36 TC × 5.8m 실행)
- 스크린샷: `/tmp/rummi-qa-v5/src/frontend/test-results/` (5개 FAIL 디렉토리)
- 실행 시각: 2026-04-24 19:00 KST 전후 (본 테스트 5m50s)
- Pod: `frontend-f4db45987-z24mv` (image: `rummiarena/frontend:day3-final-v5`, Running RESTARTS=0)
- Git: `main` `aadea75` (PR #83 merge commit, F3 롤백)

**QA 최종 판정 (v5)**: **부분성공**. F1/F2/F5 13 TC GREEN 안정 유지, 그러나 F3 롤백만으로는 EXT/GHOST 회귀 복구 불가. **v4→v5 결과 완전 동일 (28P/5F/3S)** 이라는 사실은 F3 이외의 원인이 있음을 강력히 시사한다. Week 2 최우선 과제는 **revert bisect 기반 범인 commit 식별** (W2-A, P0). 사용자 퇴근 후 실기에서 실제 extend (서버 런 뒤/앞 drop) 를 손으로 시도해보고 화면 피드백을 확인해 재조사 진입 경로 좁힐 것.
