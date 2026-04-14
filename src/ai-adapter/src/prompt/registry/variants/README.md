# PromptRegistry Variants — 추가 가이드

본 디렉토리는 PromptRegistry 가 빌드 타임에 등록하는 모든 변형(variant) 을 모아둔 곳이다.
SP3 (Task #20) 가 본 인덱스를 작성했으며, 향후 변형 추가는 본 가이드 한 페이지 분량의 절차만 따른다.

## 1. 현재 등록된 변형

| id | base | thinking | recommendedModels | designDoc |
|----|------|---------|-------------------|----------|
| `v2` | (none) | standard | openai, claude, deepseek, ollama | `docs/02-design/21-...` |
| `v3` | v2 | standard | deepseek-reasoner, dashscope, openai, claude | `docs/02-design/24-...` |
| `v3-tuned` | v3 | extended | deepseek-reasoner, dashscope | `docs/03-development/19-...` |
| `v4` | v3 | standard | openai, claude, deepseek-reasoner, dashscope | `docs/03-development/20-...` (placeholder) |
| `character-ko` | (none) | standard | ollama | `src/ai-adapter/src/prompt/persona.templates.ts` |

## 2. 새 변형 추가 절차 (체크리스트)

1. **명명**: `<base>[-<modifier>]` 평면 네임스페이스. modifier 는 hyphen 1개 + 소문자 영문 (`tuned`, `thinking`, `qwen3`).
2. **본문 작성**: `src/ai-adapter/src/prompt/` 또는 `src/ai-adapter/src/adapter/<provider>/` 아래에 system/user/retry 빌더 export.
3. **variant 파일**: 본 디렉토리에 `<id>.variant.ts` 생성, 본문을 import 하여 `PromptVariant` 객체 export.
4. **registry 등록**: `prompt-registry.service.ts` 의 `registerBuiltinVariants()` 메서드에 `this.register(...)` 1줄 추가.
5. **default mapping (선택)**: 특정 ModelType 에 자동 매핑하려면 `defaultForModel()` 수정.
6. **단위 테스트**: `prompt-registry.service.spec.ts` 에 등록 검증 1건 추가 권장.
7. **Helm values**: 새 환경변수 추가 시 `helm/charts/ai-adapter/values.yaml` 에 빈 문자열 default 와 함께 추가.

## 3. 금지 사항

- **다중 modifier 금지**: `v4-thinking-deepseek` ❌. 필요 시 fused 표기 (`v4dt`).
- **GameStateDto 외 인자 의존 금지**: persona/difficulty 의존이 필요한 변형은 character-ko 패턴(placeholder) 으로 등록.
- **본문 수정 금지**: 기존 변형(`v2`, `v3`, `v3-tuned`)의 본문은 절대 수정하지 말 것. 수정이 필요하면 새 변형으로 등록.
- **register() 를 production code 에서 호출하지 말 것**: SP4 A/B 실험 프레임워크 전용 API. 일반 어댑터 코드는 `resolve()` 만 사용.

## 4. 변형 폐기 절차

1. 사용하는 어댑터 spec 에서 mock 제거
2. `default-recommendation` 매핑에서 제거
3. variant 파일 제거 + registerBuiltinVariants() 의 register() 줄 제거
4. 변형 본문(prompt 텍스트) 파일은 별도 PR 로 삭제 (다른 변형이 wrap 하는지 grep 후)

## 5. 참고

- 설계: `docs/02-design/39-prompt-registry-architecture.md` §4~§6
- ADR: 39번 §3 (ADR-021 ~ ADR-024)
- v4 SP1 산출물: `docs/03-development/20-common-system-prompt-v4-design.md`
