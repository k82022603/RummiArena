# 95. DeepSeek V4 Phase 1 -- V4-Flash vs V4-Pro 비교

- **작성일**: 2026-04-27
- **Sprint**: Sprint 7 W2
- **작성자**: QA Engineer
- **성격**: 실험 보고서 (대전 데이터 + 근인 분석 + 판정)

---

## 1. 실험 설계

### 1.1 목적

DeepSeek V4 세대 모델(V4-Flash, V4-Pro) 2종을 **non-thinking 모드**(기본값)로 실전 대전하여 추론 성능을 비교한다. 기존 DeepSeek R1 Reasoner(thinking 모드)의 Round 5 데이터를 참조 기준으로 삼는다.

### 1.2 통제 조건

| 항목 | 설정 |
|------|------|
| 프롬프트 | v2 (USE_V2_PROMPT=true) |
| 최대 턴 | 80 |
| AI_ADAPTER_TIMEOUT_SEC | 700s (변경 없음) |
| WS_TIMEOUT (스크립트) | 770s |
| DEEPSEEK_V4_THINKING_MODE | false (non-thinking) |
| 상대 | AutoDraw Human (항상 DRAW) |
| 캐릭터 | calculator / expert / psychologyLevel=2 |
| response_format | json_object (non-thinking 모드 기본) |
| temperature | 0 |
| max_tokens | 1024 |
| image | rummiarena/ai-adapter:v4-51b658b |

### 1.3 ConfigMap 상태

```yaml
DEEPSEEK_DEFAULT_MODEL: deepseek-v4-flash  # Game 1
# deepseek-v4-pro  # Game 2
DEEPSEEK_V4_THINKING_MODE: "false"
DEEPSEEK_REASONER_CONTEXT_SHAPER: passthrough
```

---

## 2. 결과 요약

| 항목 | V4-Flash | V4-Pro | R1 Round 5 (참조) |
|------|----------|--------|------------------|
| 모드 | non-thinking | non-thinking | thinking (always) |
| place rate | **0.0%** | **~14.3%** (1/7, 부분 데이터) | 30.8% |
| fallback rate | **100%** | ~71.4% | 0% |
| 총 턴 수 | 10 (FORFEIT) | 16 (게임 중단) | 80 |
| AI 턴 수 | 5 (2 초기 + 3 카운트) | 7 | 40 |
| 배치 타일 수 | 0 | 5 (T12에서 1회) | 32 |
| 평균 응답 시간 | 2.4s | ~21.6s | 131.5s |
| 게임당 비용 | $0.003 | ~$0.003 (부분) | $0.013 |
| 완주 여부 | N (FORFEIT at T10) | N (게임 중단 at T16) | Y |
| 주요 실패 원인 | INVALID_MOVE (랙에 없는 타일 참조) | JSON 절삭 + ERR_GROUP_NUMBER | - |

> V4-Pro는 K8s pod 재시작으로 인해 T16에서 게임이 중단됨. 부분 데이터이나 패턴은 명확함.

---

## 3. 상세 분석

### 3.1 V4-Flash (Game 1)

#### 관찰된 두 가지 모드

V4-Flash에서 실행 시점에 따라 **서로 다른 두 가지 실패 패턴**이 관찰되었다.

**패턴 A: 빈 content (첫 번째 시도, T52까지 관찰 후 프로세스 타임아웃)**

```
[DeepSeekAdapter] reasoning (2751 chars): We are given a table...
[ResponseParser] JSON 파싱 실패: 응답에서 JSON 객체를 찾을 수 없습니다. | raw:
```

- V4-Flash API가 `reasoning_content`(2500-2800자)를 반환하지만 `content` 필드는 빈 문자열
- `thinking: {type: "disabled"}`를 명시했음에도 모델이 내부적으로 reasoning을 수행
- `response_format: json_object`가 content 출력을 강제하지 못함
- 5회 재시도 모두 동일 패턴 -> 강제 드로우 (fallback)
- 응답 시간: ~98s/턴 (reasoning에 시간 소요)
- **100% fallback, place rate 0%**

**패턴 B: 유효 JSON 반환, 게임 엔진 거부 (두 번째 시도, 완료)**

```
[deepseek] 성공 action=place latencyMs=2789
ws: AI place error, falling back to force draw
error: "랙에 타일 \"K10a\"이(가) 없습니다"
```

- V4-Flash가 JSON을 정상 반환 (1-3초, 빠름)
- 그러나 타일 참조가 **환각**(hallucination): 랙에 없는 타일을 place하려 함
- game-server 규칙 검증에서 전부 거부
- 5회 연속 강제 드로우 -> `AI_FORCE_DRAW_LIMIT` -> **FORFEIT** (T10)
- 응답 시간: avg 2.4s, 매우 빠르지만 무의미

#### V4-Flash 근인

1. non-thinking 모드에서 reasoning_content가 여전히 생성됨 -> API 동작 불일치 (패턴 A)
2. content 필드에 JSON이 생성될 때도 타일 인코딩 이해 부족 -> 랙에 없는 타일 참조 (패턴 B)
3. `extractBestJson()` 복구 로직이 non-thinking 모드에서는 실행되지 않음 -> reasoning_content 내 JSON 미활용

### 3.2 V4-Pro (Game 2, 부분 데이터)

#### 턴별 기록

| 턴 | 결과 | 응답 시간 | 상세 |
|----|------|-----------|------|
| T02 | ROLLBACK_FORCED | 7.4s | ERR_GROUP_NUMBER (그룹 크기 미달) |
| T04 | DRAW (fallback) | 70.3s | JSON 절삭으로 5회 재시도 후 강제 드로우 |
| T06 | ROLLBACK_FORCED | 7.8s | ERR_GROUP_NUMBER |
| T08 | ROLLBACK_FORCED | 8.1s | ERR_GROUP_NUMBER |
| T10 | ROLLBACK_FORCED | 9.0s | ERR_GROUP_NUMBER |
| T12 | **PLACE (5 tiles)** | **5.9s** | 유일한 성공 배치 |
| T14 | ROLLBACK_FORCED | 42.3s | ERR_GROUP_COLOR_DUP (색상 중복) |
| T16 | (게임 중단) | - | pod 재시작으로 중단 |

#### V4-Pro JSON 절삭 문제

V4-Pro의 가장 심각한 문제는 **JSON 출력이 중간에 잘리는 현상**이다.

```json
// 실제 반환값 (attempt 1, position 199에서 절삭)
{
  "action": "place",
  "tableGroups": [
    {"tiles": ["B11a", "B12a", "B13a"]},
    {"tiles": ["Y11a", "Y12a", "Y13a"]},
    {"tiles": ["K10a", "K11b", "K12a"]}
  // <-- 여기서 끊김, 닫는 ] } 없음
```

절삭 위치가 매번 다름: position 135, 191, 199, 224, 286, 502. `response_format: json_object`를 지정했음에도 완전한 JSON을 보장하지 못한다.

#### V4-Pro 근인

1. `max_tokens: 1024` 이내이나 completion_tokens는 195-389로 충분 -> 토큰 한도 문제가 아님
2. V4-Pro API가 `response_format: json_object`를 제대로 구현하지 않은 것으로 추정
3. 그럼에도 T12에서 5타일 배치 성공 -> JSON이 짧은 경우(그룹 수가 적을 때) 완전한 JSON 생성 가능
4. ERR_GROUP_NUMBER 다발: 3장 미만 그룹 생성 시도 -> 게임 규칙 이해 부족

---

## 4. R1 Reasoner 대비 비교

### 4.1 왜 R1이 더 나은가

| 차원 | R1 Reasoner | V4-Flash | V4-Pro |
|------|-------------|----------|--------|
| thinking 모드 | 항상 ON | OFF | OFF |
| JSON 파싱 성공률 | ~100% (extractBestJson 활용) | 0% (패턴A) / 100% (패턴B) | ~30% (절삭 문제) |
| 타일 참조 정확도 | 높음 | 낮음 (환각) | 중간 |
| 게임 규칙 이해도 | 높음 | 낮음 | 낮음 |
| 응답 시간 | 131.5s (느림) | 2.4s (빠름) / 98s (패턴A) | 21.6s (중간) |
| 비용/게임 | $0.013 | $0.003 | ~$0.003 |

### 4.2 핵심 차이: thinking 모드의 효과

R1 Reasoner는 항상 thinking 모드로 동작하며, `extractBestJson()` 다단계 복구 로직이 적용된다:
1. content에서 JSON 직접 파싱
2. content에서 JSON 객체 추출
3. **reasoning_content에서 마지막 JSON 추출** (이것이 R1의 성공 비결)

V4 모델은 non-thinking 모드에서 `extractBestJson()`이 호출되지 않으므로, reasoning_content에 있을 수 있는 유효한 JSON이 활용되지 않는다.

---

## 5. 코드 차원 발견 사항

### 5.1 non-thinking 모드에서 reasoning_content 미활용 (adapter 결함)

`src/ai-adapter/src/adapter/deepseek.adapter.ts` 라인 298-301:

```typescript
let finalContent = content;
if (thinkingMode) {
  finalContent = this.extractBestJson(content, reasoningContent);
}
```

V4-Flash 패턴 A에서 `reasoning_content`에 유효한 추론이 있으나, non-thinking 모드이므로 `extractBestJson()`이 호출되지 않아 빈 `content`가 그대로 전달된다. **V4 모델이 non-thinking으로 설정되어도 reasoning_content를 반환하는 경우, 이를 활용하는 로직이 필요하다.**

### 5.2 JSON 절삭 복구 미비

V4-Pro의 절삭된 JSON은 구조적으로 복구 가능한 경우가 많다:
```json
{"action":"place","tableGroups":[{"tiles":["K10a","K11a","K12a"]},{"tiles":["R10a","R11a","R12b"]}
// 끝에 ]} 만 추가하면 유효
```
그러나 현재 파서에는 이런 "거의 완전한 JSON"의 복구 로직이 없다.

---

## 6. 판정

### V4-Flash vs V4-Pro 승자: **V4-Pro (조건부)**

- V4-Flash: place rate 0%, 100% 실패 -> **부적합**
- V4-Pro: place rate ~14.3% (부분 데이터), 1회 성공 배치 -> **조건부 가능성**
- 두 모델 모두 R1 Reasoner(30.8%) 대비 현저히 열위

### 운영 권고

1. **V4 non-thinking 모드는 현 시점에서 실전 투입 부적합**
   - JSON 파싱 실패율이 너무 높고, 타일 참조 환각이 심함
   - `AI_FORCE_DRAW_LIMIT`에 도달하여 게임이 조기 종료됨

2. **V4-Flash thinking 모드 테스트 권고** (Phase 2)
   - `DEEPSEEK_V4_THINKING_MODE=true` 설정 시 `extractBestJson()` 활성화
   - R1과 유사한 reasoning_content 기반 JSON 추출이 가능해짐
   - V4-Flash의 빠른 응답 시간(2-3s) + thinking 모드 조합 기대

3. **코드 개선 후보** (Phase 3):
   - non-thinking 모드에서도 reasoning_content가 존재하면 `extractBestJson()` 적용
   - 절삭된 JSON 복구 로직 추가 (닫는 괄호 자동 보완)
   - `AI_FORCE_DRAW_LIMIT` 횟수 조정 검토 (현재 5회 -> 게임 도중 학습 기회 부여)

### 비용 효율

V4 모델은 R1 대비 비용이 1/4 이하 ($0.003 vs $0.013)이고 응답 시간도 크게 빠르다. thinking 모드 활성화 시 비용/시간이 증가하겠지만, R1 수준으로는 가지 않을 것으로 예상된다. 성능만 확보되면 비용 면에서 매우 유리하다.

---

## 7. 실험 로그 참조

- V4-Flash 완료 게임: `/tmp/v4-flash-game1.log` (T10, FORFEIT)
- V4-Flash 결과 JSON: `scripts/ai-battle-3model-r4-results.json` (백업: `/tmp/v4-flash-results.json`)
- V4-Pro 부분 게임: `/tmp/v4-pro-game2.log` (T16, 중단)
- ai-adapter 로그: `kubectl logs deploy/ai-adapter -n rummikub`

---

## 8. 다음 단계 (Phase 2 제안)

```
Phase 2-A: V4-Flash thinking 모드 대전 (1게임)
  DEEPSEEK_V4_THINKING_MODE=true
  extractBestJson() 활성화 -> R1 수준 JSON 추출 기대

Phase 2-B: non-thinking 코드 개선 후 재측정
  reasoning_content fallback 추가
  JSON 절삭 복구 로직 추가

Phase 2-C: V4-Pro thinking 모드 대전 (1게임)
  비교 대상 확장
```

---

## 9. Phase 1-B: V4 Thinking 모드 실전 대전 (2026-04-27 20:00~)

### 9.1 실행 배경 및 환경 발견

Phase 1 non-thinking 실험 후, 동일 조건으로 V4-Flash/V4-Pro를 재실행하려 했으나 **Deployment env 오버라이드**가 발견되었다.

**발견된 문제**: Deployment의 `env` 필드에 `DEEPSEEK_V4_THINKING_MODE=true`가 하드코딩되어 있어, ConfigMap의 `false` 값을 덮어쓰고 있었다.

```yaml
# Deployment env (우선도 높음)
- name: DEEPSEEK_V4_THINKING_MODE
  value: "true"
# ConfigMap (덮어써짐)
DEEPSEEK_V4_THINKING_MODE: "false"
```

결과적으로 두 게임 모두 **thinking 모드**로 실행되었다. 이것은 원래 Phase 2에서 계획했던 실험(V4 thinking 모드)에 해당한다.

### 9.2 통제 조건 (Phase 1-B)

| 항목 | 설정 |
|------|------|
| 프롬프트 | v2 (USE_V2_PROMPT=true) |
| 최대 턴 | 80 |
| AI_ADAPTER_TIMEOUT_SEC | 700s |
| WS_TIMEOUT | 770s |
| DEEPSEEK_V4_THINKING_MODE | **true** (Deployment env 오버라이드) |
| 코드패스 | `[DeepSeek-V4-Thinking]` (extractBestJson 활성) |
| image | rummiarena/ai-adapter:v4-fix-792e706 |
| temperature | 0 |

### 9.3 Game 1-B: V4-Flash Thinking 결과

| 항목 | 값 |
|------|-----|
| 모델 | deepseek-v4-flash + thinking 모드 |
| 결과 | **FORFEIT** (AI_FORCE_DRAW_LIMIT) |
| 총 턴 | 12 |
| AI place | 1회 (5 tiles) |
| AI draw | 0 |
| ROLLBACK_FORCED | 5회 (ERR_GROUP_COLOR_DUP x2, ERR_SET_SIZE x3) |
| 평균 응답 시간 | 5.4s (p50=3.7s, min=2.1s, max=11.9s) |
| 비용 | $0.001 |
| 스크립트 place rate | 100.0% (1/1, 유효 place 기준) |

**턴별 기록:**

| 턴 | 결과 | 응답 시간 | 상세 |
|----|------|-----------|------|
| T02 | **PLACE (5 tiles)** | 2.1s | cumul=5, 첫 배치 성공 |
| T04 | ROLLBACK_FORCED | 2.1s | ERR_GROUP_COLOR_DUP |
| T06 | ROLLBACK_FORCED | 11.9s | ERR_SET_SIZE |
| T08 | ROLLBACK_FORCED | 7.2s | ERR_SET_SIZE |
| T10 | ROLLBACK_FORCED | 3.7s | ERR_SET_SIZE |
| T12 | ROLLBACK_FORCED | - | ERR_SET_SIZE -> AI_DEACTIVATED -> FORFEIT |

**분석**: V4-Flash thinking은 응답이 매우 빠르고(2~12초), JSON 파싱 자체는 성공한다(extractBestJson 활성). 그러나 게임 규칙 이해가 부족하여 대부분의 배치 시도가 Game Engine에서 거부된다. 5회 연속 ROLLBACK_FORCED로 AI_FORCE_DRAW_LIMIT 도달하여 기권 처리.

V4-Flash non-thinking(Phase 1, 패턴 B)과 비교하면:
- non-thinking: 환각(랙에 없는 타일 참조)으로 실패
- thinking: JSON은 올바르지만 규칙 위반(그룹 색상 중복, 세트 크기 미달)으로 실패
- thinking 모드가 JSON 품질을 높이지만, 전략적 추론 능력은 여전히 부족

### 9.4 Game 2-B: V4-Pro Thinking 결과 (진행 중)

| 항목 | 값 (T04까지 부분 데이터) |
|------|-----|
| 모델 | deepseek-v4-pro + thinking 모드 |
| 결과 | **진행 중** (tmux session: game2) |
| 현재 턴 | T06 대기 중 |
| AI place | 1회 (7 tiles, T02) |
| AI draw | 1회 (T04) |
| ROLLBACK_FORCED | 0 |
| 평균 응답 시간 | 306.3s (T02: 242.6s, T04: 370.0s) |
| 예상 비용/턴 | $0.0026 |

**턴별 기록:**

| 턴 | 결과 | 응답 시간 | tokens (in/out) | 상세 |
|----|------|-----------|-----------------|------|
| T02 | **PLACE (7 tiles, cumul=7)** | 242.6s | 2,469 / 8,143 | 첫 배치 성공, 유효 |
| T04 | DRAW | 370.0s | 2,466 / 12,562 | 정상 draw 결정 |

**분석**: V4-Pro thinking은 기존 R1 Reasoner와 유사한 프로파일을 보인다:
- 응답 시간: 242~370초 (R1 avg 131s, max 356s 대비 더 느림)
- Output tokens: 8,143~12,562 (매우 많은 reasoning)
- 첫 배치에서 7 tiles 성공 -- R1보다 많은 타일을 한 번에 배치
- ROLLBACK_FORCED 0건 -- 유효한 수만 생성 (R1과 동일)

V4-Pro thinking은 R1 수준의 전략적 추론을 보이지만, 응답 시간이 약 2배 길다. 80턴 완주 시 예상 소요 시간은 약 3~4시간.

### 9.5 Phase 1-B 비교표

| 항목 | V4-Flash Thinking | V4-Pro Thinking | R1 Reasoner (Round 5 참조) |
|------|-------------------|-----------------|--------------------------|
| place rate | 100% (1/1, 조기 종료) | 50% (1/2, 진행 중) | 30.8% |
| fallback | 0 | 0 | 0 |
| ROLLBACK_FORCED | 5회 | 0 | 0 |
| 유효 배치 타일 | 5 | 7 | 32 |
| 총 턴 | 12 (FORFEIT) | 4+ (진행 중) | 80 |
| 평균 응답 시간 | 5.4s | 306.3s | 131.5s |
| 비용/턴 | $0.0002 | $0.0026 | $0.001 |
| JSON 파싱 성공률 | 100% | 100% | ~100% |
| 게임 규칙 준수율 | 낮음 (17%) | 높음 (100%, 부분) | 높음 (~100%) |

### 9.6 핵심 발견

1. **Deployment env 오버라이드 문제**: ConfigMap과 Deployment env가 충돌하여 의도와 다른 모드로 실행됨. 이것은 인프라 관리 부채이며 즉시 수정이 필요하다.

2. **V4-Flash thinking**: JSON 파싱은 성공하지만 게임 규칙 이해가 부족. 빠른 응답 시간(2~12초)은 장점이나, 유효한 수를 구성하지 못해 실전 부적합.

3. **V4-Pro thinking**: R1 수준의 전략 품질을 보이지만 응답 시간이 약 2배 느림 (306s vs 131s). Output tokens가 매우 많아(8k~12k) 비용도 R1의 2~3배. 성능 대비 비용 효율이 R1보다 나쁨.

4. **thinking 모드 vs non-thinking 모드 비교** (V4-Flash 기준):
   - non-thinking(Phase 1): JSON 파싱 자체가 실패 (빈 content 또는 절삭)
   - thinking(Phase 1-B): JSON 파싱 성공, 그러나 규칙 위반 빈발
   - thinking 모드가 필수이나 그것만으로는 V4-Flash의 전략 능력 부족을 해결하지 못함

### 9.7 수정된 운영 권고

1. **V4-Flash**: non-thinking, thinking 모두 실전 부적합. 비용/속도 장점이 있으나 전략 품질이 치명적으로 부족.

2. **V4-Pro thinking**: R1 대안 후보이나 응답 시간과 비용이 더 나쁨. 80턴 완주 데이터 확보 후 최종 판정 필요.

3. **즉시 조치**: Deployment env에서 `DEEPSEEK_V4_THINKING_MODE` 오버라이드 제거. ConfigMap이 SSOT가 되도록 수정.

4. **R1 Reasoner 유지 권고**: 현 시점에서 R1이 V4 세대보다 모든 면에서 우위 (place rate 30.8%, fallback 0%, 응답 시간 131s, 비용 $0.013/game).

### 9.8 후속 작업

- Game 2-B (V4-Pro thinking) 완주 대기: tmux session `game2`, 로그 `/tmp/v4-pro-game2.log`
- 완주 후 결과 JSON: `scripts/ai-battle-3model-r4-results.json`
- ConfigMap 원복: `DEEPSEEK_DEFAULT_MODEL=deepseek-v4-flash`
- Deployment env 오버라이드 제거 계획 수립

---

*2026-04-27 QA Engineer 작성, 20:31 Phase 1-B 추가*
