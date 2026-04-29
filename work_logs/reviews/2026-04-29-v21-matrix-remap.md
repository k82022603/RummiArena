# B-2 검증 보고서 — V-21 재정의 후 매트릭스 + SSOT 재매핑

- **작성일**: 2026-04-29
- **작성자**: game-analyst
- **대상 SSOT**: `docs/02-design/55-game-rules-enumeration.md`, `docs/02-design/56-action-state-matrix.md`, `docs/02-design/56b-state-machine.md`, `docs/02-design/43-rule-ux-sync-ssot.md`, `docs/02-design/57-game-rule-visual-language.md`, `docs/02-design/60-ui-feature-spec.md`
- **참조 변경**: 커밋 `08c9810` (서버 롤백) / `ec337da` (프론트 롤백) / `1f53481` (빈 슬롯 차단) / `40a1f4c` (SSOT v1.2 정리)
- **페어**: B-1 (`2026-04-29-v21-server-mapping.md`) — 서버 코드 매핑 검증
- **권한 근거**: 게임 도메인 SSOT (game-analyst), 사용자 부여
- **제약 준수**: 코드 (.go/.ts/.tsx) 변경 없음, 문서 SSOT 만 수정

---

## 1. V-21 재정의 후 invariant 요약

> "게임 시작은 방의 모든 좌석이 채워졌을 때만 허용한다. `len(activePlayers) === MaxPlayers` 인 경우에만 `StartGame` 진행. 빈 슬롯 1개라도 남아 있으면 `EMPTY_SLOTS_REMAINING (400)` 거부. PLAYING 상태 mid-game join 은 **미지원**."

UR-39 (Mid-Game 진입자 첫 턴 안내 모달) 는 trigger 영구 미발생 → **폐기 (ID 결번 보존)**. 차후 신규 룰은 UR-41 부터 부여.

---

## 2. SSOT 별 PASS / MISMATCH / 적용 변경

### 2.1 `55-game-rules-enumeration.md`

| 항목 | 상태 | 비고 |
|------|------|------|
| §2.25 V-21 재정의 본문 | **PASS** | 이미 v1.2 (`40a1f4c`) 에서 정의/검증 위치/위반 예시/서버 응답/UI 응답/D-05 의존성/테스트/이력 8행 모두 갱신됨 |
| §3.7 UR-39 폐기 표기 | **PASS** | "(폐기됨, 2026-04-29)" + ID 결번 + UR-41 부여 안내 명시 |
| §7 룰 카운트 (V-* 25, UR-* 39 활성, D-* 12) | **PASS** | 활성 76 / 결번 1 / 명목 77 |
| §8 변경 이력 v1.2 | **PASS** | V-21 재정의 + UR-39 폐기 + 카운트 갱신 명시 |
| 인접 룰 V-20 / UR-37 / UR-38 / UR-40 | **PASS** | V-21 재정의 영향 없음 (mid-game 무관 룰들) — `55` v1.2 명시적 "유지" 표기 확인 |

**적용한 변경**: 없음 (이미 v1.2 갱신 완료, B-2 작업 시점에 이미 fully synced).

### 2.2 `56-action-state-matrix.md`

| 셀 / 섹션 | 상태 | 비고 |
|-----------|------|------|
| §3.4 A3 (랙→서버 그룹 extend) PRE_MELD 셀 | **PASS** | UR-37 fall-through 정책 유지 — V-21 재정의와 무관 |
| §3.15 A14 ConfirmTurn FAIL 결과 | **PASS** | V-20 패널티 (Human 3 / AI 1) 명시 — 영향 없음 |
| §3.16 A15 RESET_TURN | **PASS** | UR-38 분리 명세 — 영향 없음 |
| §3.19 A19 TURN_START | **PASS** | "UR-39 mid-game 진입자 첫 턴 안내 모달 분기 **폐기**" v1.2 갱신 명시 |
| §3.19 A21 INVALID_MOVE | **PASS** | UR-38 + UR-40 명세 — 영향 없음 |
| §5 deferred 메모 (V-21 점유 표기) | **PASS** | "방 정원 충족 후 게임 시작" 으로 갱신 |
| §7 변경 이력 v1.2 | **PASS** | UR-39 폐기 + V-21 재정의 점유 갱신 + "유지" 항목 명시 |

**적용한 변경**: 없음.

**행동 매트릭스 영향 평가**:
- V-21 invariant 는 **PLAYING 진입 시점** (StartGame) 에만 작용. 본 매트릭스의 21개 행동 (A1~A21) 은 **모두 PLAYING in-game** 행동이므로 V-21 직접 매핑 셀 **없음**.
- 영향이 잠재했던 셀: A19 TURN_START 의 mid-game 진입자 첫 턴 분기 → 폐기로 단순화 (분기 자체 제거).
- JoinRoom (방 입장 — pre-game) 은 본 매트릭스 scope 외 (방 화면 별도 SSOT, 행동 매트릭스에 없음).
- StartGame (호스트 게임 시작 — pre-game) 도 본 매트릭스 scope 외.
- 즉 V-21 재정의는 **A19 TURN_START 셀 1개 단순화** 외 in-game 행동 전반에 영향 없음.

### 2.3 `56b-state-machine.md`

| 항목 | 상태 |
|------|------|
| V-21 / UR-39 / mid-game 인용 | **PASS (인용 없음)** |
| pending 그룹 상태 머신 (S0~S5) | **PASS (영향 없음)** |

**적용한 변경**: 없음.

**근거**: 56b 는 in-game pending 그룹의 미시 상태 머신. V-21 (방 진입 invariant) 과 직교.

### 2.4 `43-rule-ux-sync-ssot.md`

| 항목 | 사전 상태 | 적용 변경 |
|------|----------|----------|
| 헤딩 SSOT 참조 카운트 ("룰 71개") | **MISMATCH** (2026-04-28 V-20/V-21/UR-37~40 추가 시 미동기화) | 활성 76 + 결번 1 = 명목 77 로 갱신 |
| §1 본문 ("게임룰 71개") | **MISMATCH** | "활성 76 (V-* 25 / UR-* 39 / D-* 12, 결번 UR-39 1)" 으로 갱신 |
| §4 헤딩 ("전체 71개") | **MISMATCH** | "전체 활성 76 + 결번 1" 갱신 |
| §4.1 V-* 표 V-20/V-21 행 | **MISSING** | V-20 (패널티 ERR-T+INFO-T) + V-21 (DISABLE) 신규 행 추가 |
| §4.1 V-* 헤딩 ("전체 23개") | **MISMATCH** | "전체 25개" 갱신 |
| §4.2 UR-* 표 UR-37/38/39/40 행 | **MISSING** | UR-37 (INFO-T turn 1회) + UR-38 (정책) + UR-39 (폐기 결번) + UR-40 (INFO-T 패널티 안내) 추가 |
| §4.2 UR-* 헤딩 ("전체 36개") | **MISMATCH** | "전체 39개 (활성) + 결번 1" 갱신 |
| §8 변경 이력 v1.1 | **MISSING** | v1.1 (2026-04-29 game-analyst) 추가, V-20/V-21 + UR-37/38/40 활성 + UR-39 결번 동기화 명시 |

**V-21 매핑 결정**: DISABLE 만 부여. **별도 UR-* 신규 발행 없음** — SSOT 55 §2.25 의 "별도 UR-* 신규 발행 없음 — 기존 방 화면 UX 범주" 명시 결정을 준수. StartGame 버튼은 `len(activePlayers) === MaxPlayers` 일 때만 활성, 미충족 시 비활성 + 부족 인원 안내.

### 2.5 `57-game-rule-visual-language.md`

| 항목 | 상태 |
|------|------|
| V-21 / UR-39 / EMPTY_SLOT 인용 | **PASS (인용 없음)** |
| `hasInitialMeld` 인용 (UR-13/V-13a 컨텍스트) | **PASS (in-game UR-13 와만 결합, V-21 무관)** |

**적용한 변경**: 없음.

### 2.6 `60-ui-feature-spec.md`

| 항목 | 상태 |
|------|------|
| F-NN 25개 카탈로그 | **PASS (영향 없음)** |
| StartGame / JoinRoom 관련 F-NN | **없음 (방 화면 scope 밖)** |

**적용한 변경**: 없음.

**잔존 이슈**: 60 은 **in-game** 25 개 F-NN 카탈로그. V-21 의 호스팅 화면 (StartGame 버튼 활성/비활성 + 부족 인원 안내) 은 본 SSOT 의 F-NN 영역 밖 (기존 WaitingRoom 컴포넌트 영역). 향후 방 화면 F-NN 신설 검토 필요 시 PM 결정 필요.

---

## 3. RISK-01~06 영향 평가

| 항목 | 결과 |
|------|------|
| docs/ 전반에서 `RISK-0[1-6]` ID grep | **0건** |
| 56 §RISK 또는 부속 RISK 섹션 존재 | **없음** |
| 가장 가까운 후보: 56 §5 "빠진 셀 / 향후 carve-out" (deferred 항목 2개) | V-21 재정의 점유 표기 갱신 완료 (이미 v1.2) |

**판정**: RISK-01~06 시리즈는 본 프로젝트 docs 에 **존재하지 않음**. 사용자 프롬프트의 RISK-01~06 은 다른 SSOT 또는 plan 파일을 가리킬 수 있으나, 현 docs/ 트리에 없으므로 본 보고서에서는 다음 두 곳을 RISK 후보로 평가:

1. **56 §5 deferred** — V-21 점유 표기 "방 정원 충족 후 게임 시작" 으로 v1.2 갱신 (이미 완료, MISMATCH 없음)
2. **41-supply-chain-risk.md** — V-21 / mid-game / EMPTY_SLOT 인용 0건. 영향 없음

**신규 RISK 추가 / 기존 폐기 / 변경 없음 판정**: **변경 없음**. V-21 재정의는 **신규 invariant 추가** 가 아니라 **mid-game 기능 자체 제거** 이므로 새로운 RISK 시나리오를 도입하지 않음. 오히려 mid-game 진입자 분배·hasInitialMeld 회귀·UR-39 모달 timing 등 잠재 RISK 가 **소멸**.

---

## 4. 최종 적용 변경 다이프 요약

### 4.1 `55-game-rules-enumeration.md` — 변경 없음 (이미 v1.2 sync)

### 4.2 `56-action-state-matrix.md` — 변경 없음 (이미 v1.2 sync)

### 4.3 `43-rule-ux-sync-ssot.md` — 5개 패치

```
- "룰 71개"                        → "활성 76 + 결번 1 = 명목 77"
- §1 "게임룰 71개"                  → "활성 76 (V-*25/UR-*39/D-*12 + UR-39 결번)"
- §4 "전체 71개"                    → "활성 76 + 결번 1"
- §4.1 헤딩 "전체 23개"             → "전체 25개"
- §4.1 표  V-19 행 다음 → V-20, V-21 신규 2행 추가
- §4.2 헤딩 "전체 36개"             → "전체 39개 (활성) + 결번 1 (UR-39)"
- §4.2 표  UR-36 행 다음 → UR-37, UR-38, UR-39 (폐기), UR-40 신규 4행 추가
- §8 변경 이력 v1.1 (2026-04-29)    추가
```

### 4.4 `56b/57/60` — 변경 없음

---

## 5. 잔존 이슈 / Follow-up

1. **방 화면 UX SSOT 부재** — V-21 invariant 의 사용자 측 표현 (StartGame 버튼 비활성 + 부족 인원 안내) 이 별도 SSOT 없이 SSOT 55 본문에만 단문으로 존재. 향후 방 화면 F-NN 카탈로그 또는 별도 wireframe 문서로 격상 후보 (PM 결정).
2. **RISK-01~06 ID 의 정확한 출처 미확인** — 사용자 프롬프트가 가리키는 RISK 시리즈가 docs/ 외부 plan 파일이나 work_logs 에 있을 가능성. 발견 시 본 평가 재실행 필요. (현 시점 docs/ 전수 grep 결과 0건.)
3. **B-1 페어 검증 결과 정합성** — `2026-04-29-v21-server-mapping.md` 의 PASS 항목이 본 보고서 §2.1 SSOT §2.25 와 1:1 일치 확인. 서버 코드 ↔ SSOT ↔ 매트릭스 3계층 모두 sync 완료.

---

## 6. 정합성 결론

| SSOT | 결론 |
|------|------|
| 55 (룰 enumeration) | **PASS** (이미 v1.2 sync) |
| 56 (행동 매트릭스) | **PASS** (이미 v1.2 sync) |
| 56b (상태 머신) | **PASS** (영향 없음) |
| 43 (룰-UX 동기화) | **FIXED** (v1.1 동기화 적용) |
| 57 (시각 언어) | **PASS** (영향 없음) |
| 60 (기능 스펙) | **PASS** (scope 밖) |
| RISK 시나리오 | **변경 없음** (기존 RISK ID 시리즈 미발견, 잠재 RISK 소멸) |

**최종 판정**: V-21 재정의 + UR-39 폐기에 대한 SSOT 정합성 — **GO** (43 v1.1 패치 적용 후).

---

## 7. 변경 이력

- **2026-04-29 v1.0**: B-2 검증 보고서 발행. SSOT 55/56/56b/57/60 정합성 확인, 43 v1.1 패치 적용. RISK 시리즈 영향 없음 판정. B-1 페어 (`2026-04-29-v21-server-mapping.md`) 와 서버 ↔ SSOT 정합성 cross-check 완료.

---

룰 ID 매핑 (의무): **V-21**, **UR-39**, **V-20**, **UR-37**, **UR-38**, **UR-40**, **D-05**.
