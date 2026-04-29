# Sprint 7 프로젝트 회고 -- ai-engineer

- **역할**: AI 프롬프트 설계, v2/v4 실험, DeepSeek V4-Pro thinking 채택
- **Sprint**: Sprint 7 (2026-04-22 ~ 2026-04-29)
- **작성일**: 2026-04-29

---

## 잘한 점 (Keep)
- DeepSeek V4-Pro thinking 모드를 실측 데이터 기반으로 채택했다. N=3 실험에서 place rate 31.9%, fallback 0, avg 102s, $0.039/game이라는 결과를 확보. V4-Flash 전 모드 탈락(place 0%), V4-Pro non-thinking 탈락(14.3%)을 명확한 수치로 기록하여 의사결정 근거를 남겼다.
- `43-rule-ux-sync-ssot.md`에서 71개 룰 전수를 UX 매핑했다. 각 룰이 UI에서 어떻게 표현되는지를 한 문서에 집중시켜, frontend-dev와 game-analyst 사이의 번역 비용을 줄였다.
- `63-deepseek-v4-migration-plan.md`에서 3단계 테스트 계획(Smoke -> A/B -> Round 6 본 대전)을 수립하고, V4-Pro 75% 할인 종료(2026/05/05) 전에 채택 결정을 완료했다.
- GPT v2 vs v4 비교 실험(docs/04-testing/57 + docs/03-development/17)에서 v4가 reasoning_tokens를 -25% 감소시키고(Cohen d=-1.46) tiles_placed는 동등하다는 결과를 도출. GPT-5-mini에서 v2 유지가 올바른 결정임을 empirical하게 입증했다.
- 프롬프트 변형 SSOT(`42-prompt-variant-standard.md`)를 유지하면서, per-model override가 없는 모델의 v2 고정 메커니즘이 stale가 아닌 의도적 설계임을 문서화했다.

## 아쉬운 점 (Problem)
- V4-Flash가 전 모드에서 place 0%라는 극단적 결과를 보인 원인을 끝까지 규명하지 못했다. "응답 파싱 실패인지, 모델 자체의 한계인지" 분리가 미흡했다.
- Round 6 대전이 Sprint 7 내에서 실행되지 못했다. V4-Pro 채택까지는 완료했지만, 4모델 정식 대전 데이터를 남기지 못한 채 스프린트가 종료됐다.

## 시도할 점 (Try)
- 모델 비교 실험 시 "응답 파싱 성공률"을 place rate와 별도 지표로 추적하여, adapter 문제와 모델 문제를 분리한다.
- 할인 종료 같은 외부 일정을 sprint 계획에 명시적으로 반영하여, 의사결정 데드라인을 놓치지 않도록 한다.

## 이번 스프린트에서 가장 기억에 남는 순간
- V4-Pro thinking 모드 Game 1이 84분 만에 완주하고 place rate 31.6%, fallback 0이 찍힌 순간. 1000초 타임아웃이 정상 응답으로 이어지는 것을 보면서 "인내가 성능이다"라고 느꼈다.

## 팀에게 한마디
- AI는 코드가 아니라 실험이다. 가설 -> 실측 -> 수치 -> 결론이라는 루프를 팀 전체가 존중해줘서, "DeepSeek가 느리니까 빼자"가 아니라 "느려도 잘 두니까 쓰자"는 결정이 가능했다.
