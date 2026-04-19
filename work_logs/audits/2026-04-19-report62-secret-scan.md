# Security Audit — Report 62 + 공개 후보 문서 시크릿 스캔

**일자**: 2026-04-19 (Sprint 6 Day 9)
**담당**: Security Engineer
**관련**: Day 9 P0 — 블로그/arXiv 공개 전 API 키 placeholder 점검
**SSOT**: `docs/04-testing/62-deepseek-gpt-prompt-final-report.md` Part 4 재현 가이드

---

## 1. 점검 범위

### 1차 점검 (지시 대상)
| 파일 | 크기 | 상태 |
|------|------|------|
| `docs/04-testing/60-round9-5way-analysis.md` | 30KB | PASS |
| `docs/04-testing/61-v2-prompt-bitwise-diff.md` | 5KB | PASS |
| `docs/04-testing/62-deepseek-gpt-prompt-final-report.md` | 58KB | PASS |

### 2차 확장 점검 (공개 시 연동 노출 가능성)
| 파일 | 비고 |
|------|------|
| `PLAN.md` | 레포 루트 — 블로그 링크 시 노출 확률 높음 |
| `docs/04-testing/29-deepseek-round3-battle-plan.md` | Round 3 보고서 |
| `docs/05-deployment/07-secret-injection-guide.md` | Secret 주입 가이드 (placeholder 사용) |
| `docs/03-development/02-secret-management.md` | 시크릿 관리 (placeholder 사용) |
| `docs/00-tools/19-llm-apis.md` | 공식 prefix 안내 |
| 전체 `docs/`, `work_logs/` 재귀 | 광범위 grep |

---

## 2. 패턴별 매치 결과

| 패턴 | 대상 파일 (1차) | 매치 수 | 판정 |
|------|---------------|--------|------|
| `sk-[A-Za-z0-9_-]{20,}` (완전 키) | 60/61/62 | 0 | PASS |
| `sk-` (prefix 포함 일반) | 62 | 3 | PASS (모두 `sk-...` `sk-ant-...` placeholder) |
| `Bearer ...` / Authorization 헤더 | 60/61/62 | 0 | PASS |
| `API_KEY=<16자 이상>` | 60/61/62 | 0 | PASS |
| `gho_`, `ghp_`, `AKIA`, `eyJ...` | 60/61/62 | 0 | PASS |
| `[A-Za-z0-9]{40,}` (entropy) | 60/61/62 | 0 (코드블록 해시 링크뿐) | PASS |
| `Cookie`, `session`, `token`, `password`, `secret` | 60/61/62 | 다수 | PASS (모두 기술 용어: `reasoning_tokens`, `secret generic`, `tokens_out`) |
| `PRIVATE KEY`, `ssh-rsa`, `client_secret` | 60/61/62 | 0 | PASS |
| `.env`, `export VAR=` | 60/61/62 | 0 | PASS |
| 개인 이메일 / 도메인 | 60/61/62 | 0 | PASS |
| IP 주소 노출 | 60/61/62 | 0 | PASS |

### 리포트 62 — 3건 sk- 매치 상세

```
docs/04-testing/62-deepseek-gpt-prompt-final-report.md:769:  --from-literal=DEEPSEEK_API_KEY=sk-...
docs/04-testing/62-deepseek-gpt-prompt-final-report.md:770:  --from-literal=OPENAI_API_KEY=sk-...
docs/04-testing/62-deepseek-gpt-prompt-final-report.md:771:  --from-literal=ANTHROPIC_API_KEY=sk-ant-...
```

모두 **Part 4.3.1 Kubernetes 환경 준비** 의 예시 커맨드. `sk-...` / `sk-ant-...` 는 완전한 placeholder (실제 키 일부 노출 없음). **PASS**.

---

## 3. 확장 점검에서 발견된 ISSUE (공개 확장 리스크)

### ISSUE #1 — `PLAN.md:83-85` (PATCHED)

레포 루트 `PLAN.md` 에 API 키 **prefix 힌트** 3건 노출:

**Before**:
```
- [x] OpenAI API Key 준비 — sk-proj-ce7... (2026-03-23)
- [x] Anthropic (Claude) API Key 준비 — sk-ant-api03-... (2026-03-23)
- [x] DeepSeek API Key 준비 — sk-7c302... (2026-03-23)
```

**After**:
```
- [x] OpenAI API Key 준비 — [REDACTED-OPENAI-KEY] (2026-03-23)
- [x] Anthropic (Claude) API Key 준비 — [REDACTED-ANTHROPIC-KEY] (2026-03-23)
- [x] DeepSeek API Key 준비 — [REDACTED-DEEPSEEK-KEY] (2026-03-23)
```

**리스크 평가**:
- 3자/5자 prefix 는 단독으로 키 재구성 불가능 — **이론적 안전**
- 그러나 `sk-proj-ce7` 의 "ce7" 3자는 OpenAI 프로젝트 키의 고유 식별자 일부 → 공격자 엔트로피 감소
- DeepSeek `sk-7c302` 5자는 특히 민감. DeepSeek 키는 OpenAI 호환 32자 규격 중 5자 노출 = 27자 brute force 로 축소 이론 가능 (실제 $2^{160}$ 여전히 안전하지만 보수적 원칙)
- 블로그/arXiv 공개 시 레포가 첨부되고 prefix 가 사회공학적 단서로 활용될 수 있음
- **보수적 redaction 권고에 따라 즉시 패치**

**커밋 이력**: `87c8cbf` (2026-04-13 데일리 마감) 에서 이미 push 됨 → Git history 에는 남아있음. **이는 별도 조치 필요 (아래 § 6)**.

### ISSUE #2 — `docs/04-testing/29-deepseek-round3-battle-plan.md:97` (PATCHED)

**Before**:
```
| DEEPSEEK_API_KEY | `sk-7c30242...` (주입 완료) | PASS |
```

**After**:
```
| DEEPSEEK_API_KEY | `[REDACTED-DEEPSEEK-KEY]` (주입 완료) | PASS |
```

**리스크 평가**: DeepSeek 키 **7자 prefix** 노출 (`PLAN.md` 보다 2자 더 많음). Round 3 배틀 플랜 문서이므로 테크 블로그 후속편에서 링크될 가능성 있음. 즉시 패치.

---

## 4. SAFE (오탐, 패치 불필요)

| 파일 | 매치 | 판정 근거 |
|------|------|---------|
| `docs/05-deployment/07-secret-injection-guide.md` (본 repo) | `sk-proj-xxx`, `sk-ant-xxx` (8건) | 완전 placeholder `xxx` — 안전 |
| `docs/03-development/02-secret-management.md` | `sk-ant-...` | 주석 내 예시 — 안전 |
| `docs/03-development/04-ai-adapter-guide.md` | `sk-ant-...` | placeholder — 안전 |
| `docs/00-tools/02-kubernetes.md` | `sk-ant-xxx` | placeholder — 안전 |
| `docs/00-tools/19-llm-apis.md` | `sk-ant-...` | 공식 prefix 설명 — 안전 |
| `.claude/worktrees/agent-a16f41fc/...` | 위 동일 매치 복제 | **untracked** (git ls-files 없음) — 로컬 전용 |

---

## 5. 판정 종합

| 분류 | 건수 | 비고 |
|------|------|------|
| PASS | 1차 3개 + 확장 5개 문서 | 60/61/62 전부 placeholder 처리 완료 상태로 집필됨 |
| ISSUE (discovered) | 2건 | `PLAN.md`, `docs/04-testing/29` |
| PATCHED | 2건 | 위 2건 모두 `[REDACTED-*-KEY]` 로 대체 |

**블로그/arXiv 공개 가능 여부**: **GO** (Report 62 자체는 처음부터 안전, 연관 레포 파일 2건은 현재 시점 패치 완료)

---

## 6. 후속 권고 (Day 9 daily-close 반영 필요)

### P0 (오늘 중)
- [x] `PLAN.md:83-85` redact (완료)
- [x] `docs/04-testing/29:97` redact (완료)
- [ ] 본 패치를 git 커밋 (daily-close 시 포함)

### P1 (Sprint 6 후반)
- [ ] **Git history 정리 판단**: prefix 힌트는 GitHub 에서 `87c8cbf` 커밋에 이미 기록됨. 공격 성공 가능성은 극히 낮지만, 완전 제거하려면 `git filter-repo` 또는 BFG 로 history rewrite 필요. **권고: rewrite 비용 > 실제 리스크** 이므로 rewrite 불필요, 대신 **해당 API 키 3개 모두 rotate** 권고 (이미 PLAN.md 날짜는 2026-03-23, 한 달 경과 — 어차피 rotate 주기 도래)
- [ ] `.gitignore` 에 `.claude/worktrees/` 명시 추가 (현재 untracked 상태지만 방어선 강화)
- [ ] secret scan pre-commit hook 도입 검토 (`gitleaks` 또는 `detect-secrets`)

### P2 (Sprint 7)
- [ ] SEC-REV-013 의존성 감사: `src/ai-adapter/` npm audit 결과 **25개 취약점 (High 9 + Moderate 12 + Low 4)** 확인. 대부분 dev dependencies (`@typescript-eslint`, `webpack` in `@nestjs/cli`, `picomatch`, `tmp`, `inquirer`). 런타임 영향 없음. `npm audit fix` 는 breaking change 없이 적용 가능한 부분만 선별 패치 권고
  - High severity 주요 건: `picomatch` ReDoS (GHSA-c2c7-rcm5-vvqj), `webpack` allowlist bypass SSRF (GHSA-8fgc-7cc6-rx7x), `tmp` symlink write (GHSA-52f5-9888-hmc6), `@typescript-eslint` 체인

---

## 7. 배포 시 노출 주의 파일 리스트 (재확인)

이미 `.gitignore` 또는 `scripts/secret-replacements.txt` 로 관리 중:

**Git 추적 제외 (시크릿)**:
- `.env`, `.env.cicd`, `src/admin/.env.local`, `src/ai-adapter/.env`, `src/frontend/.env.local`
- `*.pem`, `*-key.pem`
- `helm/charts/*/templates/secret.yaml` (템플릿이므로 안전하지만 values 주입 경로 확인됨)

**Git 추적됨이지만 안전 (placeholder)**:
- `.env.example`, `.env.cicd.example`
- `src/ai-adapter/.env.example`, `src/frontend/.env.local.example`
- `scripts/secret-replacements.txt` (치환 규칙만)

**추가 권고**:
- `.claude/worktrees/` (현재 untracked, `.gitignore` 명시 권고)
- `admin.tar` (루트 `git status` 에 untracked — 내용 확인 불필요하지만 gitignore 추가 권고)
- `test-results/.last-run.json` (현재 untracked)

---

## 8. 시그니처

- **점검자**: Security Engineer (Opus 4.7 xhigh)
- **검토 완료 시각**: 2026-04-19 (Day 9 오전)
- **다음 재점검**: 블로그 초안 완성 후 + arXiv 업로드 직전 각 1회
