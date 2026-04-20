# 47. shaper_id MoveResponse 기록 hook 분석 메모

- 작성일: 2026-04-20 (Sprint 6 Day 11)
- 작성자: node-dev
- 상태: 분석 메모 (구현 Sprint 7)
- 관련 문서: ADR 44 (`44-context-shaper-v6-architecture.md`), `42-prompt-variant-standard.md`,
  `src/ai-adapter/src/common/dto/move-response.dto.ts`, `src/game-server/internal/client/ai_client.go`

---

## 1. 현재 MoveResponse 구조

정의: `src/ai-adapter/src/common/dto/move-response.dto.ts` / Go 미러: `ai_client.go MoveMetadata`

```
MoveResponseDto.metadata (MoveMetadataDto)
  modelType, modelName, latencyMs, promptTokens, completionTokens, retryCount, isFallbackDraw
```

`shaperId` / `promptVariantId` 필드는 현재 없음. Go 측도 동일.

---

## 2. ContextShaper 호출 지점 현황

어제(Day 10) 구현 완료: `ShaperRegistry` + 3종 Shaper + `PromptBuilderService.buildUserPrompt(req, shaped?)`.

**미연결 상태 (Sprint 7 대상)**:
- `MoveModule` 에 `ShaperRegistry` 미등록
- `BaseAdapter.generateMove()` 에서 `reshape()` 미호출 → `shaped` 파라미터 항상 `undefined`

hook 추가 진입점: `BaseAdapter.generateMove()` 내 `userPrompt` 생성 직전.
`ShaperRegistry` 주입 → `reshape()` 호출 → `buildUserPrompt(req, shaped)` 전달 흐름과 동시 구현.

---

## 3. shaper_id 주입 방안 3안 비교

### 안 A — `MoveMetadataDto` 에 플랫 필드 직접 추가

```typescript
shaperId!: string;        // 'passthrough' | 'joker-hinter' | 'pair-warmup'
promptVariantId!: string; // 'v2' | 'v3' | 'v4' | ...
```

단순하나, 이후 `hintsUsed`, `shapeDurationMs` 등 shaper 전용 메트릭이 추가될 때 metadata가 비대화.

### 안 B — `metadata.contextInfo` 중첩 객체 추가 (권장)

```typescript
// 신규 ContextInfoDto
export class ContextInfoDto {
  @IsString() shaperId!: string;
  @IsString() promptVariantId!: string;
}
// MoveMetadataDto 에 추가
@ValidateNested() @Type(() => ContextInfoDto)
contextInfo!: ContextInfoDto;
```

Go 측: `ContextInfo struct { ShaperId, PromptVariantId string }` + `MoveMetadata.ContextInfo` 필드.

### 안 C — HTTP Response Header (`X-Shaper-Id`)

DTO 변경 없음. 그러나 커스텀 header는 Istio VS / 로드밸런서 통과 시 소실 위험 있고,
DB 기록을 위해 Go 쪽에 어차피 매핑 로직이 필요하므로 우회만 추가됨. **비권장**.

### 권장: 안 B

1. ADR 44 §1 "2축 직교" — variant 축(`promptVariantId`)과 shaper 축(`shaperId`)을
   `contextInfo` 한 블록에 묶으면 42번 §2 표 B 의 2차원 SSOT 를 응답 레이어에서도 반영.
2. Go `json.Decoder` 기본 동작(unknown field 무시 / missing field = zero-value) 으로 하위 호환.
3. Sprint 7+ 확장 (`hintsUsed: number`, `shapeDurationMs: number`) 시 이 블록만 수정.

---

## 4. Go(game-server) 영향 및 shaper_id 포맷

DB 컬럼 가정: `shaper_id VARCHAR(32) DEFAULT 'passthrough'`, `prompt_variant_id VARCHAR(16) DEFAULT 'v2'`

| Shaper | shaperId 전달값 |
|---|---|
| PassthroughShaper | `"passthrough"` |
| JokerHinterShaper | `"joker-hinter"` |
| PairWarmupShaper | `"pair-warmup"` |

kebab-case, 소문자, 최대 13자 — VARCHAR(32) 에 여유. Go Dev 마이그 `DEFAULT 'passthrough'` 와
빈 문자열 충돌 방어: `if shaperId == "" { shaperId = "passthrough" }` 권장.

---

## 5. 변경 영향 파일

### ai-adapter (TypeScript)

| 파일 | 내용 |
|---|---|
| `src/common/dto/move-response.dto.ts` | `ContextInfoDto` 추가, `MoveMetadataDto.contextInfo` 추가 |
| `src/adapter/base.adapter.ts` | `ShaperRegistry` 주입, `reshape()` 호출, `contextInfo` 채움 |
| `src/move/move.module.ts` | `ShaperRegistry` provider 등록 |
| `src/common/parser/response-parser.service.ts` | `buildFallbackDraw()` 에 `contextInfo` 기본값 |
| `src/adapter/*.spec.ts` (4개) + `move.service.spec.ts` + `move.controller.spec.ts` | assertion 추가 |

### game-server (Go)

| 파일 | 내용 |
|---|---|
| `internal/client/ai_client.go` | `ContextInfo` struct, `MoveMetadata.ContextInfo` 필드 |
| `internal/client/ai_client_test.go` | 역직렬화 테스트 |
| DB 마이그레이션 (Go Dev 별도) | `shaper_id`, `prompt_variant_id` 컬럼 추가 |

**영향 파일 수: 총 12개** (ai-adapter 4 소스 + 6 spec / game-server 1 소스 + 1 test)

API 스펙 문서 `docs/02-design/11-ai-move-api-contract.md` §3.7 갱신 필요.

---

## 6. 하위 호환성

- **TypeScript**: `contextInfo` 는 필수 필드 → `responseParser` 내 모든 응답 생성 경로에 채워야 함.
  `buildFallbackDraw()` 기본값: `{ shaperId: 'passthrough', promptVariantId: 'unknown' }`.
- **Go**: `json.Decoder` 는 missing field 를 zero-value로 처리 → 구버전 응답 수신 시 panic 없음.
  Go strict mode(`DisallowUnknownFields`) 를 쓰지 않으므로 신규 필드도 안전하게 파싱.

---

## 7. variant SSOT 일관성

`contextInfo.promptVariantId` 를 동일 블록에 포함하면 42번 §2 표 B 의 2축이 응답에서도 표현된다.

```
contextInfo.shaperId        ← ShaperRegistry.getActive(modelType).shaperId
contextInfo.promptVariantId ← PromptRegistry.getActive(modelType).variantId  // 신규 getActive() 필요
```

`PromptRegistry` 에 `getActive(modelType): ActiveVariantInfo` 가 아직 공개 메서드로 없다면
Sprint 7 구현 시 `resolveActiveVariant()` 에서 추출하여 채운다.
42번 §5 체크리스트에 "contextInfo 동기화" 항목 추가 필요.
