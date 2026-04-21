---
name: pre-deploy-playbook
description: 배포 전 Claude가 사용자 역할로 실제 게임을 플레이해 완주 가능성을 검증한다. 사용자가 테스트하기 전에 Claude가 먼저 발견한다.
---

# Pre-deploy Playbook — Claude Plays Before User

> "코딩에서 잘못이 나오더라도 테스트에서 걸러내자. 사용자가 게임을 못 하는 걸 사용자가 직접 발견하게 두지 말자."

## Purpose

프론트엔드 변경 후 Pod 배포 직전에, Claude 가 **사용자 역할로 실제 브라우저에서 게임 1판을 완주 시도**한다. 단순 component smoke 가 아니라 **연속 플레이 흐름**에서 드래그·WS·룰 상호작용이 정상 작동하는지 실측한다.

오늘(2026-04-21) 세션에서 자동 테스트 97개 Jest + 390개 Playwright 가 모두 GREEN 이었지만 사용자가 직접 플레이해서야 "게임 진행 불가" 를 발견한 패턴이 반복됐다. 본 SKILL 은 그 패턴을 구조적으로 차단한다.

**SSOT**: `docs/04-testing/66-ui-regression-plan.md` §3.5, `ui-regression` SKILL Phase 3.5 연동

**적용 대상**:
- devops 재배포 직후 (BUILD_ID 변경 확인 직후)
- PR 머지 전 최종 게이트
- 사용자에게 "테스트해보세요" 전달 **직전**

---

## Trigger (자동 발동 조건)

- Pod rollout restart 완료 알림 수신
- PR `ready for review` 상태 전환 직전
- 사용자가 "확인해줘"·"테스트해봐"·"플레이해봐" 류 요청 직전

**수동 호출**: `pre-deploy-playbook 돌려`

---

## Phase 1: Pre-flight

1. **환경 확인**:
   - Pod BUILD_ID 확인 (`kubectl exec ... cat /app/.next/BUILD_ID`)
   - 기대 커밋 해시와 BUILD_ID 일치 여부
   - `src/frontend/e2e/auth.json` 유효성 (만료 여부)

2. **대상 endpoint 결정**:
   - 로컬: `http://localhost:30000`
   - K8s Pod: `http://localhost:30000` (NodePort)
   - production 배포 시에는 별도 smoke URL

3. **네트워크 사전 점검**:
   - `curl -I <endpoint>` 200/307 확인
   - 기존 game-server / ai-adapter Pod 정상 여부

---

## Phase 2: Playbook 실행

### 2.1 로그인 흐름

- Playwright headless Chromium 기동 (`workers=1`)
- `storageState: auth.json` 로 로그인 상태 복원
- `/lobby` 진입 성공 (응답 코드 + 페이지 렌더 확인)

### 2.2 방 생성 + AI 대전 진입

- `/room/create` 이동
- 방 생성 폼 작성:
  - 플레이어 수: 2인전
  - **AI 모델: LLaMA (Ollama)** — **기본값 (비용 $0, 속도 5~15s, 완주 검증 목적 최적)**
  - Persona: rookie
  - 난이도: 하수 (beginner)
  - 턴 제한 시간: 120초
  - 심리전 레벨: 2 (default)

**AI 모델 선택 원칙** (2026-04-21 기본값 LLaMA 로 확정):

| 모델 | 비용/턴 | 속도 | Playbook 적합도 |
|------|--------|------|----------------|
| **LLaMA (Ollama qwen2.5:3b)** | **$0** | 5~15s | **기본값** — 완주 검증이 목적이므로 AI 응답 품질 무관 |
| GPT (OpenAI gpt-5-mini) | $0.025 | 25~45s | 비용 발생 실측 재현이 필요한 특수 케이스에만 |
| Claude Sonnet 4 | $0.074 | 30~60s | 동일 |
| DeepSeek Reasoner | $0.001 | 30~350s | 속도 느려 Playbook 완주 리스크, 사용 지양 |

**Ollama cold start 대응** (2026-04-21 신규 발견):
- Ollama Pod 첫 호출 시 `llama runner started in 50s` 발생 가능
- Playbook 실행 **전** 사전 warmup 권장:
  ```bash
  kubectl exec -n rummikub deploy/ollama -- \
    curl -s -X POST http://localhost:11434/api/generate \
    -d '{"model":"qwen2.5:3b","prompt":"ready","stream":false}' > /dev/null
  ```
- devops 에 자동 warmup 스크립트 추가 검토 (Sprint 7 후속 권고)
- `방 만들기` 클릭 → 대기실 진입
- `게임 시작` 클릭 → 게임 진입
- 내 차례 배지 확인

### 2.3 플레이 시퀀스 (최소 요구치)

| 동작 | 최소 횟수 | 단언 |
|------|----------|------|
| 타일 드래그 → 빈 보드 드롭 (새 그룹) | 3회 | pendingTableGroups +1, 타일이 보드에 표시됨 (랙 복귀 아님) |
| 타일 드래그 → 기존 블록 확장 (런) | 1회 | 같은 블록 크기 +1, type="run" |
| 타일 드래그 → 기존 블록 확장 (그룹) | 1회 | 같은 블록 크기 +1, type="group" |
| 조커 포함 런 구성 | 1회 | JK 타일이 런의 일부로 인식, 점수 계산 정상 |
| 확정 시도 → 성공 | 2회 | pending 초기화, 서버 확정 그룹으로 전환 |
| 드로우 | 2회 | 랙 +1, 드로우 파일 -1 |
| 턴 진행 | 10회 이상 | 턴 번호 증가 |

### 2.4 핵심 단언 체크리스트

**드래그·드롭 정합성**:
- [ ] 모든 드롭이 **보드에 반영** (silent revert 없음)
- [ ] 같은 타일 code 가 여러 블록에 동시 표시되지 않음 (고스트 렌더 없음)
- [ ] 내 랙 타일 수 = 실제 rack 표시 수 (drift 없음)

**라벨 정합성**:
- [ ] 미확정 블록 라벨이 실제 타입과 일치 (K12+K13 은 "런", R13+B13+Y13 은 "그룹")
- [ ] 무효 조합에 "무효 세트" + 빨간 테두리
- [ ] "그룹 (미확정)" 이 3장 미만 모든 블록에 붙지 않음 (런 가능성 포함 판정)

**턴 히스토리**:
- [ ] `DRAW_TILE` / `PENALTY_DRAW` / `TIMEOUT` 모두 한글 표기
- [ ] 배치 턴은 "배치 N장" + 타일 미리보기

**플레이어 카드**:
- [ ] AI 이름에 persona 괄호 정상 (`GPT (루키)` 형식, 빈 괄호 `GPT ()` 금지)
- [ ] 난이도 표시 (`하수`/`중수`/`고수`/`—`), `고수` 가 default fallback 이 안 됨

---

## Phase 3: 실패 대응

### 3.1 실패 분류

- **A. 로그인/네트워크 실패** — 환경 문제. 재시도 2회 후 devops 에 알림
- **B. 방 생성·게임 진입 실패** — backend 이슈. game-server 로그 확인 필요
- **C. 플레이 시퀀스 중단** — UI 버그. **본 SKILL 의 주요 검출 대상**
- **D. 단언 실패** — 오늘 발견된 패턴의 재발. 즉시 regression 원인 파악

### 3.2 실패 시 필수 조치

1. **배포 게이트 차단**: 사용자에게 "확인해주세요" 전달 **금지**
2. **아티팩트 수집**:
   - 실패 지점 스크린샷 (`src/frontend/test-results/pre-deploy-playbook/YYYY-MM-DD-HHMM/`)
   - Playwright trace.zip
   - Pod 로그 (`kubectl logs ... --tail=200`)
3. **재현 시나리오 추가**: 실패 조건을 `docs/04-testing/65-*.md` 에 즉시 등재
4. **incident-response SKILL** 호출 또는 즉시 수정 에이전트 spawn

### 3.3 금지 사항

- **Playbook 실패를 "flaky" 로 치부 금지** — 드래그·네트워크 불안정은 2회 재시도 후에도 실패면 real
- **단언 일부 통과로 부분 GO 금지** — 플레이 시퀀스 중 하나라도 실패면 NO-GO
- **Playbook 생략 후 사용자 전달 금지** — 시간 압박·피로에 휘둘려 "이번만" 생략 안 함

---

## Phase 4: 리포트

### 4.1 성공 시

```
## Pre-deploy Playbook — PASS

- Endpoint: <url>
- BUILD_ID: <id>
- 소요 시간: <mm:ss>
- 플레이 시퀀스: 드래그 N회 / 확정 M회 / 드로우 K회 / 턴 L회 완주
- 단언: 모두 PASS
- 판정: GO — 사용자 전달 가능
```

### 4.2 실패 시

```
## Pre-deploy Playbook — FAIL

- Endpoint: <url>
- BUILD_ID: <id>
- 실패 지점: Phase 2.X (plus 설명)
- 실패 분류: C (UI 버그)
- 증거: screenshots/<...>, trace.zip
- 추가 관찰: ...
- 판정: NO-GO — 즉시 수정 필요. 사용자 전달 차단.
```

---

## Phase 5: 시나리오 카탈로그 편입

Playbook 에서 새로 발견된 버그는 **실패 즉시 시나리오화**:

1. given/when/then 으로 재구성
2. `docs/04-testing/65-day11-ui-scenario-matrix.md` 에 추가
3. `src/frontend/e2e/pre-deploy-playbook.spec.ts` 에 assertion 추가 (다음 Playbook 부터 자동 감지)
4. 관련 수정 커밋과 **동반 커밋** 으로 E2E 추가

---

## Playbook 스펙 파일

신규: `src/frontend/e2e/pre-deploy-playbook.spec.ts` (본 SKILL 최초 발동 시 자동 작성)

실행:
```bash
cd src/frontend
npx playwright test e2e/pre-deploy-playbook.spec.ts --workers=1 --reporter=list
```

---

## 왜 ui-regression 과 별도 SKILL 인가

- **ui-regression**: 개별 시나리오 단위 검증 (Unit / Integration / E2E spec 각각)
- **pre-deploy-playbook**: **연속 플레이** 전체 흐름 검증 — "사용자가 5분간 플레이했을 때 막히는가"

둘은 상호 보완이며, Pod 재배포 후 pre-deploy-playbook 으로 한 번 더 게이트를 건다. 본 SKILL 이 통과해야만 사용자에게 전달.

---

## 역할 분담

| 담당 | 역할 |
|------|------|
| Claude 메인 세션 | devops 재배포 알림 수신 시 본 SKILL 자동 발동 판단 |
| frontend-dev | 신규 시나리오 스펙 작성 협조, Playbook 실패 수정 |
| qa | Playbook 시나리오 카탈로그 유지 (65번 매트릭스) |
| devops | Pod 상태 + 로그 수집 보조 |

---

## 변경 이력

- **2026-04-21 v1.0**: 최초 신설. `ui-regression` SKILL Phase 3.5 에서 분리. 사용자 지시 "코딩 잘못하면 테스트라도 잘하자" + "B 별도 SKILL 분리" 반영.
- **2026-04-21 v1.1**: 첫 실전 발동(qa 에이전트, 170801 잡종 방지 PASS) 결과 반영.
  - 기본 AI 모델 GPT → **LLaMA (Ollama)** 로 변경. 비용 $0, 속도 5~15s, Playbook 완주 검증 목적에 최적. 사용자(애벌레) 지시 반영.
  - Ollama cold start 대응 섹션 추가. 첫 실행 시 50s 지연 실측됨.
  - Sprint 7 후속 권고 2건: E2E bridge 이미지 태그 (`NEXT_PUBLIC_E2E_BRIDGE=true`) + Ollama 자동 warmup 스크립트.
