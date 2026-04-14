# SP4 Prompt A/B Eval — Sample Report

- **생성일**: 2026-04-14T12:13:34.005Z
- **모드**: Dry-run (실제 LLM 호출 없음)
- **Seeds (10)**: 0x1, 0x14, 0xB, 0xF, 0x16, 0x1C, 0x2, 0x3, 0xCAFEBABE, 0xDEADBEEF
- **Variants (4)**: v2, v3, v3-tuned, v4
- **Models (4)**: openai, claude, deepseek-reasoner, dashscope
- **Matrix size**: 10 × 4 × 4 = 160 cells

## 1. Variant Metadata

| Variant | Version | Token Budget | Recommended Models | Thinking | WarnIfOff |
|---------|---------|-------------:|---------------------|----------|-----------|
| v2 | 1.0.0 | 1200 | openai, claude, deepseek, ollama | standard | no |
| v3 | 1.0.0 | 1530 | deepseek-reasoner, dashscope, openai, claude | standard | no |
| v3-tuned | 1.0.0 | 1750 | deepseek-reasoner, dashscope | extended | yes |
| v4 | 0.1.0-placeholder | 1530 | openai, claude, deepseek-reasoner, dashscope | standard | yes |

## 2. Cell Totals (seed × variant × model)

| Seed | Variant | Model | System ~tok | User ~tok | Retry ~tok | Total ~tok | Recommended |
|------|---------|-------|------------:|----------:|-----------:|-----------:|:-----------:|
| 0x1 | v2 | openai | 1654 | 227 | 368 | 2249 | yes |
| 0x1 | v3 | openai | 2252 | 246 | 406 | 2904 | yes |
| 0x1 | v3-tuned | openai | 2709 | 329 | 513 | 3551 | OFF |
| 0x1 | v4 | openai | 2252 | 246 | 406 | 2904 | yes |
| 0x1 | v2 | claude | 1654 | 227 | 368 | 2249 | yes |
| 0x1 | v3 | claude | 2252 | 246 | 406 | 2904 | yes |
| 0x1 | v3-tuned | claude | 2709 | 329 | 513 | 3551 | OFF |
| 0x1 | v4 | claude | 2252 | 246 | 406 | 2904 | yes |
| 0x1 | v2 | deepseek-reasoner | 1654 | 227 | 368 | 2249 | OFF |
| 0x1 | v3 | deepseek-reasoner | 2252 | 246 | 406 | 2904 | yes |
| 0x1 | v3-tuned | deepseek-reasoner | 2709 | 329 | 513 | 3551 | yes |
| 0x1 | v4 | deepseek-reasoner | 2252 | 246 | 406 | 2904 | yes |
| 0x1 | v2 | dashscope | 1654 | 227 | 368 | 2249 | OFF |
| 0x1 | v3 | dashscope | 2252 | 246 | 406 | 2904 | yes |
| 0x1 | v3-tuned | dashscope | 2709 | 329 | 513 | 3551 | yes |
| 0x1 | v4 | dashscope | 2252 | 246 | 406 | 2904 | yes |
| 0x14 | v2 | openai | 1654 | 227 | 368 | 2249 | yes |
| 0x14 | v3 | openai | 2252 | 247 | 407 | 2906 | yes |
| 0x14 | v3-tuned | openai | 2709 | 329 | 513 | 3551 | OFF |
| 0x14 | v4 | openai | 2252 | 247 | 407 | 2906 | yes |
| 0x14 | v2 | claude | 1654 | 227 | 368 | 2249 | yes |
| 0x14 | v3 | claude | 2252 | 247 | 407 | 2906 | yes |
| 0x14 | v3-tuned | claude | 2709 | 329 | 513 | 3551 | OFF |
| 0x14 | v4 | claude | 2252 | 247 | 407 | 2906 | yes |
| 0x14 | v2 | deepseek-reasoner | 1654 | 227 | 368 | 2249 | OFF |
| 0x14 | v3 | deepseek-reasoner | 2252 | 247 | 407 | 2906 | yes |
| 0x14 | v3-tuned | deepseek-reasoner | 2709 | 329 | 513 | 3551 | yes |
| 0x14 | v4 | deepseek-reasoner | 2252 | 247 | 407 | 2906 | yes |
| 0x14 | v2 | dashscope | 1654 | 227 | 368 | 2249 | OFF |
| 0x14 | v3 | dashscope | 2252 | 247 | 407 | 2906 | yes |
| 0x14 | v3-tuned | dashscope | 2709 | 329 | 513 | 3551 | yes |
| 0x14 | v4 | dashscope | 2252 | 247 | 407 | 2906 | yes |
| 0xB | v2 | openai | 1654 | 227 | 368 | 2249 | yes |
| 0xB | v3 | openai | 2252 | 246 | 406 | 2904 | yes |
| 0xB | v3-tuned | openai | 2709 | 329 | 513 | 3551 | OFF |
| 0xB | v4 | openai | 2252 | 246 | 406 | 2904 | yes |
| 0xB | v2 | claude | 1654 | 227 | 368 | 2249 | yes |
| 0xB | v3 | claude | 2252 | 246 | 406 | 2904 | yes |
| 0xB | v3-tuned | claude | 2709 | 329 | 513 | 3551 | OFF |
| 0xB | v4 | claude | 2252 | 246 | 406 | 2904 | yes |
| 0xB | v2 | deepseek-reasoner | 1654 | 227 | 368 | 2249 | OFF |
| 0xB | v3 | deepseek-reasoner | 2252 | 246 | 406 | 2904 | yes |
| 0xB | v3-tuned | deepseek-reasoner | 2709 | 329 | 513 | 3551 | yes |
| 0xB | v4 | deepseek-reasoner | 2252 | 246 | 406 | 2904 | yes |
| 0xB | v2 | dashscope | 1654 | 227 | 368 | 2249 | OFF |
| 0xB | v3 | dashscope | 2252 | 246 | 406 | 2904 | yes |
| 0xB | v3-tuned | dashscope | 2709 | 329 | 513 | 3551 | yes |
| 0xB | v4 | dashscope | 2252 | 246 | 406 | 2904 | yes |
| 0xF | v2 | openai | 1654 | 227 | 368 | 2249 | yes |
| 0xF | v3 | openai | 2252 | 246 | 406 | 2904 | yes |
| 0xF | v3-tuned | openai | 2709 | 329 | 513 | 3551 | OFF |
| 0xF | v4 | openai | 2252 | 246 | 406 | 2904 | yes |
| 0xF | v2 | claude | 1654 | 227 | 368 | 2249 | yes |
| 0xF | v3 | claude | 2252 | 246 | 406 | 2904 | yes |
| 0xF | v3-tuned | claude | 2709 | 329 | 513 | 3551 | OFF |
| 0xF | v4 | claude | 2252 | 246 | 406 | 2904 | yes |
| 0xF | v2 | deepseek-reasoner | 1654 | 227 | 368 | 2249 | OFF |
| 0xF | v3 | deepseek-reasoner | 2252 | 246 | 406 | 2904 | yes |
| 0xF | v3-tuned | deepseek-reasoner | 2709 | 329 | 513 | 3551 | yes |
| 0xF | v4 | deepseek-reasoner | 2252 | 246 | 406 | 2904 | yes |
| 0xF | v2 | dashscope | 1654 | 227 | 368 | 2249 | OFF |
| 0xF | v3 | dashscope | 2252 | 246 | 406 | 2904 | yes |
| 0xF | v3-tuned | dashscope | 2709 | 329 | 513 | 3551 | yes |
| 0xF | v4 | dashscope | 2252 | 246 | 406 | 2904 | yes |
| 0x16 | v2 | openai | 1654 | 227 | 368 | 2249 | yes |
| 0x16 | v3 | openai | 2252 | 246 | 406 | 2904 | yes |
| 0x16 | v3-tuned | openai | 2709 | 329 | 513 | 3551 | OFF |
| 0x16 | v4 | openai | 2252 | 246 | 406 | 2904 | yes |
| 0x16 | v2 | claude | 1654 | 227 | 368 | 2249 | yes |
| 0x16 | v3 | claude | 2252 | 246 | 406 | 2904 | yes |
| 0x16 | v3-tuned | claude | 2709 | 329 | 513 | 3551 | OFF |
| 0x16 | v4 | claude | 2252 | 246 | 406 | 2904 | yes |
| 0x16 | v2 | deepseek-reasoner | 1654 | 227 | 368 | 2249 | OFF |
| 0x16 | v3 | deepseek-reasoner | 2252 | 246 | 406 | 2904 | yes |
| 0x16 | v3-tuned | deepseek-reasoner | 2709 | 329 | 513 | 3551 | yes |
| 0x16 | v4 | deepseek-reasoner | 2252 | 246 | 406 | 2904 | yes |
| 0x16 | v2 | dashscope | 1654 | 227 | 368 | 2249 | OFF |
| 0x16 | v3 | dashscope | 2252 | 246 | 406 | 2904 | yes |
| 0x16 | v3-tuned | dashscope | 2709 | 329 | 513 | 3551 | yes |
| 0x16 | v4 | dashscope | 2252 | 246 | 406 | 2904 | yes |
| 0x1C | v2 | openai | 1654 | 227 | 368 | 2249 | yes |
| 0x1C | v3 | openai | 2252 | 247 | 407 | 2906 | yes |
| 0x1C | v3-tuned | openai | 2709 | 329 | 513 | 3551 | OFF |
| 0x1C | v4 | openai | 2252 | 247 | 407 | 2906 | yes |
| 0x1C | v2 | claude | 1654 | 227 | 368 | 2249 | yes |
| 0x1C | v3 | claude | 2252 | 247 | 407 | 2906 | yes |
| 0x1C | v3-tuned | claude | 2709 | 329 | 513 | 3551 | OFF |
| 0x1C | v4 | claude | 2252 | 247 | 407 | 2906 | yes |
| 0x1C | v2 | deepseek-reasoner | 1654 | 227 | 368 | 2249 | OFF |
| 0x1C | v3 | deepseek-reasoner | 2252 | 247 | 407 | 2906 | yes |
| 0x1C | v3-tuned | deepseek-reasoner | 2709 | 329 | 513 | 3551 | yes |
| 0x1C | v4 | deepseek-reasoner | 2252 | 247 | 407 | 2906 | yes |
| 0x1C | v2 | dashscope | 1654 | 227 | 368 | 2249 | OFF |
| 0x1C | v3 | dashscope | 2252 | 247 | 407 | 2906 | yes |
| 0x1C | v3-tuned | dashscope | 2709 | 329 | 513 | 3551 | yes |
| 0x1C | v4 | dashscope | 2252 | 247 | 407 | 2906 | yes |
| 0x2 | v2 | openai | 1654 | 227 | 368 | 2249 | yes |
| 0x2 | v3 | openai | 2252 | 247 | 407 | 2906 | yes |
| 0x2 | v3-tuned | openai | 2709 | 329 | 513 | 3551 | OFF |
| 0x2 | v4 | openai | 2252 | 247 | 407 | 2906 | yes |
| 0x2 | v2 | claude | 1654 | 227 | 368 | 2249 | yes |
| 0x2 | v3 | claude | 2252 | 247 | 407 | 2906 | yes |
| 0x2 | v3-tuned | claude | 2709 | 329 | 513 | 3551 | OFF |
| 0x2 | v4 | claude | 2252 | 247 | 407 | 2906 | yes |
| 0x2 | v2 | deepseek-reasoner | 1654 | 227 | 368 | 2249 | OFF |
| 0x2 | v3 | deepseek-reasoner | 2252 | 247 | 407 | 2906 | yes |
| 0x2 | v3-tuned | deepseek-reasoner | 2709 | 329 | 513 | 3551 | yes |
| 0x2 | v4 | deepseek-reasoner | 2252 | 247 | 407 | 2906 | yes |
| 0x2 | v2 | dashscope | 1654 | 227 | 368 | 2249 | OFF |
| 0x2 | v3 | dashscope | 2252 | 247 | 407 | 2906 | yes |
| 0x2 | v3-tuned | dashscope | 2709 | 329 | 513 | 3551 | yes |
| 0x2 | v4 | dashscope | 2252 | 247 | 407 | 2906 | yes |
| 0x3 | v2 | openai | 1654 | 227 | 368 | 2249 | yes |
| 0x3 | v3 | openai | 2252 | 247 | 407 | 2906 | yes |
| 0x3 | v3-tuned | openai | 2709 | 329 | 513 | 3551 | OFF |
| 0x3 | v4 | openai | 2252 | 247 | 407 | 2906 | yes |
| 0x3 | v2 | claude | 1654 | 227 | 368 | 2249 | yes |
| 0x3 | v3 | claude | 2252 | 247 | 407 | 2906 | yes |
| 0x3 | v3-tuned | claude | 2709 | 329 | 513 | 3551 | OFF |
| 0x3 | v4 | claude | 2252 | 247 | 407 | 2906 | yes |
| 0x3 | v2 | deepseek-reasoner | 1654 | 227 | 368 | 2249 | OFF |
| 0x3 | v3 | deepseek-reasoner | 2252 | 247 | 407 | 2906 | yes |
| 0x3 | v3-tuned | deepseek-reasoner | 2709 | 329 | 513 | 3551 | yes |
| 0x3 | v4 | deepseek-reasoner | 2252 | 247 | 407 | 2906 | yes |
| 0x3 | v2 | dashscope | 1654 | 227 | 368 | 2249 | OFF |
| 0x3 | v3 | dashscope | 2252 | 247 | 407 | 2906 | yes |
| 0x3 | v3-tuned | dashscope | 2709 | 329 | 513 | 3551 | yes |
| 0x3 | v4 | dashscope | 2252 | 247 | 407 | 2906 | yes |
| 0xCAFEBABE | v2 | openai | 1654 | 227 | 368 | 2249 | yes |
| 0xCAFEBABE | v3 | openai | 2252 | 247 | 407 | 2906 | yes |
| 0xCAFEBABE | v3-tuned | openai | 2709 | 329 | 513 | 3551 | OFF |
| 0xCAFEBABE | v4 | openai | 2252 | 247 | 407 | 2906 | yes |
| 0xCAFEBABE | v2 | claude | 1654 | 227 | 368 | 2249 | yes |
| 0xCAFEBABE | v3 | claude | 2252 | 247 | 407 | 2906 | yes |
| 0xCAFEBABE | v3-tuned | claude | 2709 | 329 | 513 | 3551 | OFF |
| 0xCAFEBABE | v4 | claude | 2252 | 247 | 407 | 2906 | yes |
| 0xCAFEBABE | v2 | deepseek-reasoner | 1654 | 227 | 368 | 2249 | OFF |
| 0xCAFEBABE | v3 | deepseek-reasoner | 2252 | 247 | 407 | 2906 | yes |
| 0xCAFEBABE | v3-tuned | deepseek-reasoner | 2709 | 329 | 513 | 3551 | yes |
| 0xCAFEBABE | v4 | deepseek-reasoner | 2252 | 247 | 407 | 2906 | yes |
| 0xCAFEBABE | v2 | dashscope | 1654 | 227 | 368 | 2249 | OFF |
| 0xCAFEBABE | v3 | dashscope | 2252 | 247 | 407 | 2906 | yes |
| 0xCAFEBABE | v3-tuned | dashscope | 2709 | 329 | 513 | 3551 | yes |
| 0xCAFEBABE | v4 | dashscope | 2252 | 247 | 407 | 2906 | yes |
| 0xDEADBEEF | v2 | openai | 1654 | 227 | 368 | 2249 | yes |
| 0xDEADBEEF | v3 | openai | 2252 | 246 | 406 | 2904 | yes |
| 0xDEADBEEF | v3-tuned | openai | 2709 | 329 | 513 | 3551 | OFF |
| 0xDEADBEEF | v4 | openai | 2252 | 246 | 406 | 2904 | yes |
| 0xDEADBEEF | v2 | claude | 1654 | 227 | 368 | 2249 | yes |
| 0xDEADBEEF | v3 | claude | 2252 | 246 | 406 | 2904 | yes |
| 0xDEADBEEF | v3-tuned | claude | 2709 | 329 | 513 | 3551 | OFF |
| 0xDEADBEEF | v4 | claude | 2252 | 246 | 406 | 2904 | yes |
| 0xDEADBEEF | v2 | deepseek-reasoner | 1654 | 227 | 368 | 2249 | OFF |
| 0xDEADBEEF | v3 | deepseek-reasoner | 2252 | 246 | 406 | 2904 | yes |
| 0xDEADBEEF | v3-tuned | deepseek-reasoner | 2709 | 329 | 513 | 3551 | yes |
| 0xDEADBEEF | v4 | deepseek-reasoner | 2252 | 246 | 406 | 2904 | yes |
| 0xDEADBEEF | v2 | dashscope | 1654 | 227 | 368 | 2249 | OFF |
| 0xDEADBEEF | v3 | dashscope | 2252 | 246 | 406 | 2904 | yes |
| 0xDEADBEEF | v3-tuned | dashscope | 2709 | 329 | 513 | 3551 | yes |
| 0xDEADBEEF | v4 | dashscope | 2252 | 246 | 406 | 2904 | yes |

## 3. Pairwise Summary (A → B per model)

| A | B | Model | Seeds | Identical | Sys +/- | Sys Decision +/- | User +/- | Avg Δtok | Note |
|---|---|-------|------:|:---------:|:-------:|:---------------:|:--------:|--------:|------|
| v2 | v3 | openai | 10 | no | +370/-30 | +160/-20 | +10/-0 | +656 |  |
| v2 | v3 | claude | 10 | no | +370/-30 | +160/-20 | +10/-0 | +656 |  |
| v2 | v3 | deepseek-reasoner | 10 | no | +370/-30 | +160/-20 | +10/-0 | +656 |  |
| v2 | v3 | dashscope | 10 | no | +370/-30 | +160/-20 | +10/-0 | +656 |  |
| v2 | v3-tuned | openai | 10 | no | +630/-50 | +320/-40 | +60/-0 | +1302 |  |
| v2 | v3-tuned | claude | 10 | no | +630/-50 | +320/-40 | +60/-0 | +1302 |  |
| v2 | v3-tuned | deepseek-reasoner | 10 | no | +630/-50 | +320/-40 | +60/-0 | +1302 |  |
| v2 | v3-tuned | dashscope | 10 | no | +630/-50 | +320/-40 | +60/-0 | +1302 |  |
| v2 | v4 | openai | 10 | no | +370/-30 | +160/-20 | +10/-0 | +656 |  |
| v2 | v4 | claude | 10 | no | +370/-30 | +160/-20 | +10/-0 | +656 |  |
| v2 | v4 | deepseek-reasoner | 10 | no | +370/-30 | +160/-20 | +10/-0 | +656 |  |
| v2 | v4 | dashscope | 10 | no | +370/-30 | +160/-20 | +10/-0 | +656 |  |
| v3 | v3-tuned | openai | 10 | no | +290/-50 | +190/-50 | +50/-0 | +646 |  |
| v3 | v3-tuned | claude | 10 | no | +290/-50 | +190/-50 | +50/-0 | +646 |  |
| v3 | v3-tuned | deepseek-reasoner | 10 | no | +290/-50 | +190/-50 | +50/-0 | +646 |  |
| v3 | v3-tuned | dashscope | 10 | no | +290/-50 | +190/-50 | +50/-0 | +646 |  |
| v3 | v4 | openai | 10 | yes | +0/-0 | +0/-0 | +0/-0 | +0 | IDENTICAL — v3 and v4 produce byte-exact prompts on openai (expected: v4 is placeholder → v3 body pending SP5) |
| v3 | v4 | claude | 10 | yes | +0/-0 | +0/-0 | +0/-0 | +0 | IDENTICAL — v3 and v4 produce byte-exact prompts on claude (expected: v4 is placeholder → v3 body pending SP5) |
| v3 | v4 | deepseek-reasoner | 10 | yes | +0/-0 | +0/-0 | +0/-0 | +0 | IDENTICAL — v3 and v4 produce byte-exact prompts on deepseek-reasoner (expected: v4 is placeholder → v3 body pending SP5) |
| v3 | v4 | dashscope | 10 | yes | +0/-0 | +0/-0 | +0/-0 | +0 | IDENTICAL — v3 and v4 produce byte-exact prompts on dashscope (expected: v4 is placeholder → v3 body pending SP5) |
| v3-tuned | v4 | openai | 10 | no | +50/-290 | +50/-190 | +0/-50 | -646 |  |
| v3-tuned | v4 | claude | 10 | no | +50/-290 | +50/-190 | +0/-50 | -646 |  |
| v3-tuned | v4 | deepseek-reasoner | 10 | no | +50/-290 | +50/-190 | +0/-50 | -646 |  |
| v3-tuned | v4 | dashscope | 10 | no | +50/-290 | +50/-190 | +0/-50 | -646 |  |

## 4. Decision Impact Samples (System Prompt)

System prompt 차이에서 "결정 영향 키워드"를 포함한 라인을 샘플로 보여준다.

### v2 → v3 (openai)

**Added decision lines (16)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `Thinking: R7a + R7b + B7a = all number 7, three tiles -> group?`
- `WRONG! R7a and R7b are BOTH Red (R). Color R appears twice -> REJECTED.`
- `-> {"action":"draw","reasoning":"R7a+R7b are same color R, cannot form group"}`
- `WRONG: tableGroups has only Group1 extended -> 4 groups MISSING -> REJECTED.`

**Removed decision lines (2)**:
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`

### v2 → v3 (claude)

**Added decision lines (16)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `Thinking: R7a + R7b + B7a = all number 7, three tiles -> group?`
- `WRONG! R7a and R7b are BOTH Red (R). Color R appears twice -> REJECTED.`
- `-> {"action":"draw","reasoning":"R7a+R7b are same color R, cannot form group"}`
- `WRONG: tableGroups has only Group1 extended -> 4 groups MISSING -> REJECTED.`

**Removed decision lines (2)**:
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`

### v2 → v3 (deepseek-reasoner)

**Added decision lines (16)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `Thinking: R7a + R7b + B7a = all number 7, three tiles -> group?`
- `WRONG! R7a and R7b are BOTH Red (R). Color R appears twice -> REJECTED.`
- `-> {"action":"draw","reasoning":"R7a+R7b are same color R, cannot form group"}`
- `WRONG: tableGroups has only Group1 extended -> 4 groups MISSING -> REJECTED.`

**Removed decision lines (2)**:
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`

### v2 → v3 (dashscope)

**Added decision lines (16)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `Thinking: R7a + R7b + B7a = all number 7, three tiles -> group?`
- `WRONG! R7a and R7b are BOTH Red (R). Color R appears twice -> REJECTED.`
- `-> {"action":"draw","reasoning":"R7a+R7b are same color R, cannot form group"}`
- `WRONG: tableGroups has only Group1 extended -> 4 groups MISSING -> REJECTED.`

**Removed decision lines (2)**:
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`

### v2 → v3-tuned (openai)

**Added decision lines (32)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`

**Removed decision lines (4)**:
- `## Example 5: Multiple sets placed at once`
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`
- `9. Run the validation checklist above before outputting`

### v2 → v3-tuned (claude)

**Added decision lines (32)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`

**Removed decision lines (4)**:
- `## Example 5: Multiple sets placed at once`
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`
- `9. Run the validation checklist above before outputting`

### v2 → v3-tuned (deepseek-reasoner)

**Added decision lines (32)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`

**Removed decision lines (4)**:
- `## Example 5: Multiple sets placed at once`
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`
- `9. Run the validation checklist above before outputting`

### v2 → v3-tuned (dashscope)

**Added decision lines (32)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`

**Removed decision lines (4)**:
- `## Example 5: Multiple sets placed at once`
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`
- `9. Run the validation checklist above before outputting`

### v2 → v4 (openai)

**Added decision lines (16)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `Thinking: R7a + R7b + B7a = all number 7, three tiles -> group?`
- `WRONG! R7a and R7b are BOTH Red (R). Color R appears twice -> REJECTED.`
- `-> {"action":"draw","reasoning":"R7a+R7b are same color R, cannot form group"}`
- `WRONG: tableGroups has only Group1 extended -> 4 groups MISSING -> REJECTED.`

**Removed decision lines (2)**:
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`

### v2 → v4 (claude)

**Added decision lines (16)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `Thinking: R7a + R7b + B7a = all number 7, three tiles -> group?`
- `WRONG! R7a and R7b are BOTH Red (R). Color R appears twice -> REJECTED.`
- `-> {"action":"draw","reasoning":"R7a+R7b are same color R, cannot form group"}`
- `WRONG: tableGroups has only Group1 extended -> 4 groups MISSING -> REJECTED.`

**Removed decision lines (2)**:
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`

### v2 → v4 (deepseek-reasoner)

**Added decision lines (16)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `Thinking: R7a + R7b + B7a = all number 7, three tiles -> group?`
- `WRONG! R7a and R7b are BOTH Red (R). Color R appears twice -> REJECTED.`
- `-> {"action":"draw","reasoning":"R7a+R7b are same color R, cannot form group"}`
- `WRONG: tableGroups has only Group1 extended -> 4 groups MISSING -> REJECTED.`

**Removed decision lines (2)**:
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`

### v2 → v4 (dashscope)

**Added decision lines (16)**:
- `- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries`
- `Thinking: R7a + R7b + B7a = all number 7, three tiles -> group?`
- `WRONG! R7a and R7b are BOTH Red (R). Color R appears twice -> REJECTED.`
- `-> {"action":"draw","reasoning":"R7a+R7b are same color R, cannot form group"}`
- `WRONG: tableGroups has only Group1 extended -> 4 groups MISSING -> REJECTED.`

**Removed decision lines (2)**:
- `5. ALL existing table groups are preserved in tableGroups (none omitted)`
- `6. Compare all valid combinations: pick the one that places the MOST tiles`

### v3 → v3-tuned (openai)

**Added decision lines (19)**:
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`
- `  meld, opponent near-winning), take your time. Enumerate, compare, verify.`

**Removed decision lines (5)**:
- `## Example 5: Multiple sets placed at once`
- `6. Compare all valid combinations to maximize tiles placed:`
- `   d. Pick the combination that places the MOST total tiles from your rack`
- `   e. Tie-breaker: prefer placing higher-number tiles (they are worth more points)`
- `9. Run the validation checklist above before outputting`

### v3 → v3-tuned (claude)

**Added decision lines (19)**:
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`
- `  meld, opponent near-winning), take your time. Enumerate, compare, verify.`

**Removed decision lines (5)**:
- `## Example 5: Multiple sets placed at once`
- `6. Compare all valid combinations to maximize tiles placed:`
- `   d. Pick the combination that places the MOST total tiles from your rack`
- `   e. Tie-breaker: prefer placing higher-number tiles (they are worth more points)`
- `9. Run the validation checklist above before outputting`

### v3 → v3-tuned (deepseek-reasoner)

**Added decision lines (19)**:
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`
- `  meld, opponent near-winning), take your time. Enumerate, compare, verify.`

**Removed decision lines (5)**:
- `## Example 5: Multiple sets placed at once`
- `6. Compare all valid combinations to maximize tiles placed:`
- `   d. Pick the combination that places the MOST total tiles from your rack`
- `   e. Tie-breaker: prefer placing higher-number tiles (they are worth more points)`
- `9. Run the validation checklist above before outputting`

### v3 → v3-tuned (dashscope)

**Added decision lines (19)**:
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`
- `  meld, opponent near-winning), take your time. Enumerate, compare, verify.`

**Removed decision lines (5)**:
- `## Example 5: Multiple sets placed at once`
- `6. Compare all valid combinations to maximize tiles placed:`
- `   d. Pick the combination that places the MOST total tiles from your rack`
- `   e. Tie-breaker: prefer placing higher-number tiles (they are worth more points)`
- `9. Run the validation checklist above before outputting`

### v3 → v4 (openai) — IDENTICAL

### v3 → v4 (claude) — IDENTICAL

### v3 → v4 (deepseek-reasoner) — IDENTICAL

### v3 → v4 (dashscope) — IDENTICAL

### v3-tuned → v4 (openai)

**Added decision lines (5)**:
- `## Example 5: Multiple sets placed at once`
- `6. Compare all valid combinations to maximize tiles placed:`
- `   d. Pick the combination that places the MOST total tiles from your rack`
- `   e. Tie-breaker: prefer placing higher-number tiles (they are worth more points)`
- `9. Run the validation checklist above before outputting`

**Removed decision lines (19)**:
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`
- `  meld, opponent near-winning), take your time. Enumerate, compare, verify.`

### v3-tuned → v4 (claude)

**Added decision lines (5)**:
- `## Example 5: Multiple sets placed at once`
- `6. Compare all valid combinations to maximize tiles placed:`
- `   d. Pick the combination that places the MOST total tiles from your rack`
- `   e. Tie-breaker: prefer placing higher-number tiles (they are worth more points)`
- `9. Run the validation checklist above before outputting`

**Removed decision lines (19)**:
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`
- `  meld, opponent near-winning), take your time. Enumerate, compare, verify.`

### v3-tuned → v4 (deepseek-reasoner)

**Added decision lines (5)**:
- `## Example 5: Multiple sets placed at once`
- `6. Compare all valid combinations to maximize tiles placed:`
- `   d. Pick the combination that places the MOST total tiles from your rack`
- `   e. Tie-breaker: prefer placing higher-number tiles (they are worth more points)`
- `9. Run the validation checklist above before outputting`

**Removed decision lines (19)**:
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`
- `  meld, opponent near-winning), take your time. Enumerate, compare, verify.`

### v3-tuned → v4 (dashscope)

**Added decision lines (5)**:
- `## Example 5: Multiple sets placed at once`
- `6. Compare all valid combinations to maximize tiles placed:`
- `   d. Pick the combination that places the MOST total tiles from your rack`
- `   e. Tie-breaker: prefer placing higher-number tiles (they are worth more points)`
- `9. Run the validation checklist above before outputting`

**Removed decision lines (19)**:
- `# Thinking Time Budget (NEW in v3-tuned)`
- `You have a generous thinking budget. This is intentional — use it.`
- `Empirically, the hardest turns in a game needed ~2x the thinking tokens of early`
- `- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.`
- `  meld, opponent near-winning), take your time. Enumerate, compare, verify.`

## 5. Conclusions

- 비교 쌍 총 24개 중 4개는 IDENTICAL (즉 동일 프롬프트), 20개는 실제 차이가 있음.
- **v4는 현재 placeholder** (v3 본문 재사용). SP5 머지 시 재실행 필요.
- 토큰 델타 최대: 1302 tokens/cell (대략치)
- 결정 영향 라인 총합 최대: 360건 (어느 쌍이 가장 많은 지시어 변경을 포함했는지 판단)

## 6. SP5 입력 제안

- SP5는 v4 placeholder의 실제 본문을 SP1 §6.1~6.5 기반으로 교체한 뒤 본 harness를 다시 실행해야 함.
- 재실행 명령: `node scripts/prompt-ab-eval.mjs --variants v3,v4 --models deepseek-reasoner,dashscope,openai,claude`
- 기대: v4가 더 이상 IDENTICAL이 아니어야 하며 decision impact > 0이어야 함.
