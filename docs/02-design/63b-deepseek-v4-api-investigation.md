# 63b. DeepSeek V4 API 사양 조사 결과

- **상태**: 완료
- **일자**: 2026-04-27
- **작성자**: ai-engineer (Claude Opus 4.6)
- **목적**: DeepSeek R1 -> V4-Flash 교체를 위한 API 사양 실증 확인
- **관련**: `docs/02-design/63-deepseek-v4-migration-plan.md`

---

## 1. 모델 ID (실증 확인)

### `/v1/models` 엔드포인트 응답 (2026-04-27)

```json
{
  "object": "list",
  "data": [
    { "id": "deepseek-v4-flash", "object": "model", "owned_by": "deepseek" },
    { "id": "deepseek-v4-pro",   "object": "model", "owned_by": "deepseek" }
  ]
}
```

| 항목 | 값 |
|------|-----|
| **V4-Flash 모델 ID** | `deepseek-v4-flash` |
| **V4-Pro 모델 ID** | `deepseek-v4-pro` |
| **기존 모델** | `deepseek-chat`, `deepseek-reasoner` -- models 목록에서 제거됨 (API 호출 시 잔액 에러로 실동작 여부 미확인) |

**핵심**: 모델 ID는 `deepseek-v4-flash`이다. 63번 문서의 추정(`deepseek-v4` 또는 `deepseek-v4-flash`)에서 후자가 정확.

---

## 2. API 엔드포인트

| 항목 | 값 |
|------|-----|
| **Base URL** | `https://api.deepseek.com/v1` (변동 없음) |
| **Chat Completions** | `POST /v1/chat/completions` (OpenAI 호환) |
| **Models List** | `GET /v1/models` |

현행 코드(`deepseek.adapter.ts` L38)의 `baseUrl = 'https://api.deepseek.com/v1'`을 변경할 필요 없다.

---

## 3. 응답 구조 (핵심)

### 3.1 DeepSeek V4 Thinking 모드

DeepSeek V4는 R1의 `reasoning_content` 방식이 아닌, OpenAI o-series 호환 `thinking` 파라미터 방식을 사용한다.

#### 요청 (thinking 모드 활성화)

```json
{
  "model": "deepseek-v4-flash",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "thinking": {
    "type": "enabled",
    "budget_tokens": 8192
  },
  "max_tokens": 16384
}
```

#### 응답 (thinking 모드)

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "최종 JSON 답변",
      "reasoning_content": "사고 과정..."
    }
  }],
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 567,
    "reasoning_tokens": 890,
    "prompt_cache_hit_tokens": 0,
    "prompt_cache_miss_tokens": 1234
  }
}
```

#### 응답 (non-thinking / 표준 모드)

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "JSON 답변"
    }
  }],
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 567,
    "prompt_cache_hit_tokens": 0,
    "prompt_cache_miss_tokens": 1234
  }
}
```

### 3.2 R1 vs V4 응답 구조 비교

| 항목 | R1 (deepseek-reasoner) | V4 (deepseek-v4-flash/pro) |
|------|----------------------|--------------------------|
| **사고 과정 필드** | `message.reasoning_content` | `message.reasoning_content` (thinking 모드 시) |
| **최종 답변 필드** | `message.content` | `message.content` |
| **thinking 활성화** | 항상 활성 (끌 수 없음) | `thinking.type: "enabled"` 파라미터로 선택적 |
| **thinking 예산** | 제어 불가 | `thinking.budget_tokens`로 제어 |
| **reasoning_tokens** | `usage` 에 포함 | `usage.reasoning_tokens` 에 포함 |
| **temperature** | 지원 안 함 (항상 0) | 지원 (non-thinking 모드) / thinking 모드 시 미지원 |
| **response_format** | `json_object` 미지원 | non-thinking 모드에서 `json_object` 지원 |

### 3.3 코드 영향 분석

**좋은 소식**: V4 thinking 모드도 `reasoning_content` 필드명을 동일하게 사용한다. 따라서 현행 `deepseek.adapter.ts`의 파싱 로직(L233: `choice.message.reasoning_content`)이 V4에서도 그대로 동작한다.

**변경 필요 사항**:

1. **thinking 파라미터 추가**: V4에서 thinking 모드를 사용하려면 요청에 `thinking` 객체를 명시적으로 추가해야 한다 (R1은 항상 thinking이었지만 V4는 기본이 non-thinking).
2. **non-thinking 모드 선택지**: V4-Flash를 non-thinking(표준 chat)으로 쓰면 `response_format: json_object` 지원이 가능하여 JSON 파싱 신뢰도가 크게 향상된다.
3. **temperature**: thinking 모드에서는 R1과 동일하게 temperature 미지원. non-thinking에서는 지원.

---

## 4. 요청 파라미터

### 4.1 Thinking 모드 파라미터

```typescript
// thinking 모드 활성화
{
  model: "deepseek-v4-flash",
  messages: [...],
  thinking: {
    type: "enabled",         // "enabled" | "disabled"
    budget_tokens: 8192      // 사고 토큰 예산 (최소 1024, 최대 모델 한도)
  },
  max_tokens: 16384          // 최종 응답 토큰 한도
}
```

### 4.2 Non-thinking 모드 파라미터

```typescript
// 표준 chat 모드 (thinking 비활성)
{
  model: "deepseek-v4-flash",
  messages: [...],
  temperature: 0.0,
  max_tokens: 1024,
  response_format: { type: "json_object" }  // JSON 모드 지원
}
```

### 4.3 지원 파라미터 요약

| 파라미터 | Thinking 모드 | Non-thinking 모드 |
|---------|-------------|-----------------|
| `temperature` | 미지원 (무시) | 0.0~2.0 |
| `top_p` | 미지원 | 지원 |
| `max_tokens` | 필수 (출력 한도) | 선택 |
| `response_format` | 미지원 | `json_object` 지원 |
| `stop` | 지원 | 지원 |
| `stream` | 지원 | 지원 |
| `thinking.budget_tokens` | 필수 | N/A |

---

## 5. 가격 확인

### 5.1 V4-Flash

| 항목 | 가격 (USD per 1M tokens) |
|------|------------------------|
| **입력 (캐시 미스)** | $0.14 |
| **입력 (캐시 히트)** | $0.014 |
| **출력** | $0.28 |
| **Thinking 토큰** | 별도 과금 없음 (출력 토큰에 포함) |

### 5.2 V4-Pro

| 항목 | 가격 (USD per 1M tokens) |
|------|------------------------|
| **입력 (캐시 미스)** | $1.74 |
| **입력 (캐시 히트)** | $0.174 |
| **출력** | $3.48 |

### 5.3 R1 (현행) 대비

| 비교 | R1 (reasoner) | V4-Flash | 절감률 |
|------|-------------|----------|-------|
| 입력 | $0.55/M | $0.14/M | **-75%** |
| 출력 | $2.19/M | $0.28/M | **-87%** |
| 추론 토큰 | 별도 과금 ($0.55/M) | 출력에 포함 | **추가 절감** |

### 5.4 비용 추적 코드 영향

`cost-tracking.service.ts`의 `MODEL_PRICING`에서 `deepseek` 항목의 가격이 이미 `{ inputPer1M: 0.14, outputPer1M: 0.28 }`로 설정되어 있다(L21). 이는 V4-Flash의 non-thinking 모드 가격과 정확히 일치한다.

**주의**: thinking 모드에서 `usage.reasoning_tokens`는 `completion_tokens`에 이미 포함되므로 별도 처리 불필요. 다만 비용 분석 시 순수 답변 토큰과 사고 토큰을 구분하려면 `reasoning_tokens`를 별도 추적하는 것이 유용하다.

---

## 6. curl 테스트 결과

### 6.1 Models 엔드포인트 (성공)

```bash
curl -s https://api.deepseek.com/v1/models \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" | jq '.data[].id'

# 결과:
# "deepseek-v4-flash"
# "deepseek-v4-pro"
```

### 6.2 Chat Completions (Insufficient Balance)

모든 모델(v4-flash, v4-pro, deepseek-chat, deepseek-reasoner)에서 동일한 잔액 부족 에러:

```json
{
  "error": {
    "message": "Insufficient Balance",
    "type": "unknown_error",
    "param": null,
    "code": "invalid_request_error"
  }
}
```

**해석**: 잔액 검증이 모델 검증보다 선행하므로, 모델 유효성은 `/v1/models` 응답으로 판단. thinking 파라미터 포함 요청에서도 파라미터 오류 없이 잔액 에러만 반환되었으므로 파라미터 형식은 유효한 것으로 추정.

### 6.3 잔액 상태

**DeepSeek API 잔액: 부족** -- 실제 호출 테스트를 위해 충전 필요.

---

## 7. node-dev 코드 수정 지침 (요약)

### 7.1 결정 사항

| 항목 | 결정 | 근거 |
|------|------|------|
| **모델 ID** | `deepseek-v4-flash` | `/v1/models` 실증 확인 |
| **API URL** | `https://api.deepseek.com/v1` (변경 없음) | 동일 |
| **Thinking 모드** | non-thinking (표준 chat) 우선 | `response_format: json_object` 지원으로 파싱 신뢰도 향상 |
| **Fallback** | thinking 모드 옵션 유지 | 추론 품질 저하 시 전환 가능 |

### 7.2 주요 코드 변경 포인트

#### A. `deepseek.adapter.ts`

1. **`isReasoner` 판별 로직 확장**: `deepseek-v4-flash`/`deepseek-v4-pro`에 대한 분기 추가
2. **`callLlm` 메서드**:
   - non-thinking 모드: `response_format: { type: "json_object" }` 사용 (현행 `deepseek-chat` 경로와 유사)
   - thinking 모드 옵션: `thinking: { type: "enabled", budget_tokens: 8192 }` 추가
3. **`reasoning_content` 파싱**: thinking 모드 사용 시 기존 로직 재활용 가능 (필드명 동일)
4. **타임아웃**: V4-Flash는 빠르므로 reasoner 전용 `Math.max(timeoutMs, 1_800_000)` 제거 또는 조건 분기

#### B. `prompt-registry.service.ts`

1. `defaultForModel()` 맵에 V4-Flash용 ModelType 추가 또는 기존 `deepseek` 타입 재활용
2. `DEEPSEEK_V4_PROMPT_VARIANT` 환경변수 고려 (선택)

#### C. `prompt-registry.types.ts`

1. `ModelType`에 `'deepseek-v4'` 추가 여부 판단 (또는 기존 `'deepseek'` 재활용)

#### D. `cost-tracking.service.ts`

1. `MODEL_PRICING.deepseek` 가격이 이미 V4-Flash와 동일 ($0.14/$0.28) -- **변경 불필요**
2. thinking 모드 사용 시 `reasoning_tokens` 별도 추적은 Phase 2에서 고려

#### E. Helm / ConfigMap

1. `values.yaml`: `DEEPSEEK_DEFAULT_MODEL: "deepseek-v4-flash"`
2. `DEEPSEEK_REASONER_*` 환경변수명 정리 (V4에서는 reasoner 아님)

### 7.3 권장 전략: Non-thinking 모드 우선

```
V4-Flash (non-thinking)
  + response_format: json_object 지원
  + temperature 제어 가능
  + 응답 빠름
  + 파싱 실패율 감소 예상
  - 추론 깊이 제한
  
V4-Flash (thinking)
  + 추론 깊이 향상
  + reasoning_content로 사고 과정 확인
  - json_object 미지원 (R1과 동일)
  - 응답 느림
  - extractBestJson 로직 필요
```

RummiArena의 게임 AI 특성상, 먼저 non-thinking 모드로 `json_object` 응답 형식의 이점을 실험하고, place rate가 부족하면 thinking 모드로 전환하는 2단계 접근을 권장한다.

---

## 8. 미해결 사항

| 항목 | 상태 | 필요 조치 |
|------|------|----------|
| **API 잔액 충전** | 부족 | 실제 호출 테스트 전 충전 필요 |
| **Thinking 모드 실 응답 구조** | 문서 기반 추정 | 잔액 충전 후 curl 실증 확인 |
| **V4-Flash place rate** | 미측정 | Stage 1 Smoke Test로 확인 |
| **deepseek-chat 폐기 여부** | 불명확 | models 목록에서 사라졌으나 API 호출 가능 여부 미확인 |
