# Batch Battle — Validation Gates

> **소유자**: QA. **연동 대상**: `SKILL.md` (DevOps 소유, 메커니즘 정의).
> 본 문서는 **"통과/실패 판정 기준"** 만 정의한다. 메커니즘은 SKILL.md 참조.

## 목적

batch-battle 의 각 Phase 종료 시점에 **자동화 가능한 정량 기준** 으로 PASS/FAIL 판정한다.
주관적 판단("관찰자가 확인", "이상 없어 보임") 금지. 모든 게이트는 exit code + 로그 형식이 결정적이어야 한다.

## 게이트 일람

| # | 게이트 | Phase | 차단 강도 |
|---|--------|-------|----------|
| G1 | DNS Pre-flight | Phase 1 (사전점검) 끝 | **HARD** (FAIL → 배치 중단) |
| G2 | Cleanup Verification | Phase 4 (사후 정리) 끝 | **SOFT** (FAIL → 강제 정리 + 보고) |
| G3 | Process Tree Snapshot | Phase 1 시작 + Phase 4 종료 | **SOFT** (FAIL → leak 보고서) |

---

## 게이트 1: DNS Pre-flight

**언제 체크**: Phase 1 사전점검 마지막 단계 (실측 kickoff 직전).

**검증 대상 endpoint** (BatchTag 의 `--models` 인자에서 자동 도출):

| 모델 | endpoint |
|------|----------|
| openai | `api.openai.com` |
| claude | `api.anthropic.com` |
| deepseek | `api.deepseek.com` |
| ollama | (skip — cluster-internal `ollama:11434`) |

**통과 조건** (모두 충족):
1. `getent hosts <endpoint>` 가 IPv4 주소 1개 이상 반환 (exit=0)
2. 응답 시간 ≤ **5초** (`timeout 5 getent hosts ...`)
3. `curl -sS -m 10 https://<endpoint>/ -o /dev/null -w "%{http_code}"` 결과가 `2xx | 401 | 403 | 404` (서비스 도달 확인 — 401 은 인증 미포함이므로 정상)
4. 직전 30분 내 사용자 네트워크 변경 이벤트 **없음** (사용자 답변 또는 `/etc/resolv.conf` mtime 확인)

**실패 시 액션** (HARD):
- 배치 kickoff **중단** (`exit 10` reserved code)
- 사용자 알림 형식 (terse 5줄):
  ```
  [G1 FAIL] DNS Pre-flight 차단
  endpoint: <name>  결과: <timeout|nxdomain|http_5xx>
  최근 네트워크 변경: <YYYY-MM-DD HH:MM | none>
  권고: 5분 대기 후 재시도 (또는 사용자 네트워크 안정화 확인)
  로그: work_logs/batch-validation/<BatchTag>-g1.log
  ```

**로그 형식** (`work_logs/batch-validation/<BatchTag>-g1.log`):
```
ISO8601_timestamp <TAB> endpoint <TAB> result <TAB> elapsed_ms <TAB> resolved_ip
2026-04-21T07:00:01+09:00  api.deepseek.com  resolved  142  104.18.7.55
2026-04-21T07:00:01+09:00  api.openai.com    timeout   5000  -
```
- 헤더 1줄(`# G1 DNS Pre-flight BatchTag=<tag>`) 이후 endpoint 별 1줄
- TAB 구분 (CSV 충돌 회피)
- `result ∈ {resolved, timeout, nxdomain, http_5xx, http_unreachable}`

**자동화 스니펫**: DevOps 가 SKILL.md 통합 시 `timeout 5 getent hosts` + `curl -sS -m 10 -w %{http_code}` + per-endpoint TAB 로그 + FAIL 시 `exit 10` 패턴으로 구현. exit 10 은 본 게이트 전용 reserved code.

**근거**:
- 5초 임계: 정상 DNS 응답은 50ms 이내. 5초 초과 = resolver 마비. (`2026-04-20-01-dns.md` §6 근거 1)
- `401|403|404` 허용: 인증 헤더 없는 root 호출은 OpenAI/Claude/DeepSeek 모두 4xx 가 정상 응답 (서비스 도달 증명).
- 30분 유예: DNS resolver / WSL2 resolv.conf 동기화 통상 5~10분, 안전마진 3배.

---

## 게이트 2: Cleanup Verification

**언제 체크**: Phase 4 사후 정리 끝 (마지막 모델 배치 완료 후).

**통과 조건** (모두 충족):
1. `pgrep -f "ai-battle"` 결과 행 수 = **0**
2. `pgrep -f "scripts/ai-battle.*\.py"` 결과 행 수 = **0** (Python 자식 leak)
3. Redis 활성 게임 키 = **사전 baseline 과 동일** (사전 baseline 은 G3 시작 시 캡처)
   ```bash
   kubectl exec -n rummikub deploy/redis -- redis-cli --raw KEYS "game:*" | wc -l
   ```
4. ai-adapter 최근 60초 `/move` 요청 = **0건**
   ```bash
   kubectl logs -n rummikub deploy/ai-adapter --since=60s | grep -c "MoveController"
   ```

**실패 시 액션** (SOFT):
- **강제 정리 자동 실행** (사용자 승인 불요 — Phase 4 정리는 자율 실행 정책 적용):
  ```bash
  pkill -TERM -f "ai-battle" ; sleep 3 ; pkill -KILL -f "ai-battle"
  pkill -TERM -f "scripts/ai-battle.*\.py" ; sleep 3 ; pkill -KILL -f "scripts/ai-battle.*\.py"
  # Redis: baseline 초과 키만 삭제
  comm -23 <(kubectl exec -n rummikub deploy/redis -- redis-cli --raw KEYS "game:*" | sort) \
           <(sort "$BASELINE_FILE") | xargs -I{} kubectl exec -n rummikub deploy/redis -- redis-cli DEL {}
  ```
- 사후 보고서 작성: `work_logs/batch-validation/<BatchTag>-g2-cleanup.md`
- 사용자 알림 (terse 6줄):
  ```
  [G2 FAIL→AUTO-RECOVERED] Cleanup leak 감지 + 자동 정리
  leak: 프로세스 <N>개, Redis 키 <M>개
  강제 정리: 완료 (PIDs: <list>, keys: <list>)
  잔존 확인: pgrep=0, redis_keys_diff=0
  영향: 다음 배치 깨끗한 상태에서 시작 가능
  보고서: work_logs/batch-validation/<TAG>-g2-cleanup.md
  ```

**로그 형식** (`work_logs/batch-validation/<BatchTag>-g2.log`):
```
# G2 Cleanup Verification BatchTag=<tag> phase=<pre|post>
ISO8601_timestamp <TAB> metric <TAB> value <TAB> baseline <TAB> diff
2026-04-21T13:42:11+09:00  pgrep_ai_battle      0  0  0
2026-04-21T13:42:11+09:00  pgrep_python_battle  2  0  +2   ← FAIL
2026-04-21T13:42:11+09:00  redis_game_keys      3  1  +2   ← FAIL
2026-04-21T13:42:11+09:00  ai_adapter_recent    0  -  0
```

**근거**:
- baseline 비교 방식: 평소 운영 중인 활성 게임(애벌레 본인 플레이 등) 을 보호하기 위함. `KEYS "game:*"` 절대값 0 강제는 위험.
- pkill 두 단계(TERM → 3s → KILL): 정상 종료 우선, 강제 종료 fallback. (`2026-04-19-01-timeout.md` 반성 3 trap 'kill 0' 패턴 보완)

---

## 게이트 3: Process Tree Snapshot

**언제 체크**: Phase 1 시작 직후(=baseline 캡처) + Phase 4 사후 정리 직전.

**통과 조건** (모두 충족):
1. 시작/종료 시점 모두 `pstree -p $$ > <log>` exit=0 (캡처 자체 성공)
2. 종료 시점 `pgrep -P <orchestrator_pid>` 결과 행 수 = **0** (자식 leak 없음)
3. 시작/종료 pstree diff 의 **추가 PID** ⊆ {orchestrator 자신, ScheduleWakeup 보조 프로세스 화이트리스트}
   - 화이트리스트: `bash`, `sleep`, `kubectl`, `tail`, `awk` (모니터링 보조)
   - 비화이트리스트 추가 PID 발견 시 FAIL

**실패 시 액션** (SOFT):
- leak PID 목록 보고서 작성: `work_logs/batch-validation/<BatchTag>-g3-leak.md`
  - 각 leak PID 의 `ps -o pid,ppid,etime,cmd --pid <pid>` 정보 포함
  - G2 의 강제 정리에 leak PID 추가 입력
- 사용자 알림 (terse 4줄):
  ```
  [G3 FAIL] Process Tree leak 감지
  leak PIDs: <list>
  cmdline: <첫 leak 의 cmd>
  G2 강제 정리에 위임 → 보고서: work_logs/batch-validation/<TAG>-g3-leak.md
  ```

**로그 형식**:
- `work_logs/batch-validation/<BatchTag>-g3-pre.txt`: 시작 시 `pstree -p $$` 전문
- `work_logs/batch-validation/<BatchTag>-g3-post.txt`: 종료 시 `pstree -p $$` 전문
- `work_logs/batch-validation/<BatchTag>-g3-diff.txt`: `diff -u pre post`
- `work_logs/batch-validation/<BatchTag>-g3-leak.md` (FAIL 시만): leak PID 별 표

**근거**:
- 반성 3 (Day 10 07시 Python 자식 PID 25482 잔존 사고). bash orchestrator kill 만으로 자식 정리 안 된다는 확증된 시나리오.
- 화이트리스트 방식: blacklist 보다 안전 (예상 못한 leak 도 잡힘).

---

## 장애보고서 ↔ 게이트 매핑

기존 장애보고서의 §7 재발방지 액션에 본 게이트 링크 추가 권고:

| 장애보고서 | Action Items 매핑 게이트 |
|-----------|------------------------|
| `work_logs/incidents/2026-04-20-01-dns.md` §7 단기 조치 | **G1** (DNS Pre-flight) — `getent hosts api.deepseek.com` 자동화 형태 |
| `work_logs/incidents/2026-04-19-01-timeout.md` §7 | **별도 처리** — 본 timeout 사고는 cleanup 미흡이 원인 아님 (DeepSeek 자율 추론 700s 초과). G2/G3 와 무관. timeout 체인 SSOT (`docs/02-design/41`) 에서 다룸. |

링크 추가 위치: 각 장애보고서 §7 의 "장기 교훈 (SKILL/ADR 반영)" 하위에 한 줄 추가:
```
- 검증 게이트: `.claude/skills/batch-battle/VALIDATION_GATES.md` G1 참조
```

---

## Sprint 7 백로그 (게이트 미커버 반성 항목)

리포트 63 Part 3 의 6개 반성 중 **자동화 정량 게이트로 커버 불가** 한 4건은 Sprint 7 정성 개선 백로그로 이관:

| # | 반성 | Sprint 7 백로그 항목 | 사유 |
|---|------|---------------------|------|
| 1 | argparse 사전 검증 안 함 | `dry-run 강제 메커니즘 — orchestrator 가 Python 스크립트 인자 schema 를 자동 추출 → 부적합 인자 사전 차단` | SKILL Phase 1 8번에 수동 체크 추가됨. 자동화 강화는 Sprint 7. |
| 2 | 모니터링 조문 안 지킴 | `15분 주기 능동 보고 자동화 + monitoring 문서 템플릿 (.claude/skills/batch-battle/MONITORING-TEMPLATE.md)` | "능동성" 은 정량 기준 불가. ScheduleWakeup hook + 보고 10항목 자동 채움으로 대체. |
| 5 | 사용자 과보호 조언 | `응답 포맷 원칙 — "하지 마세요" 단정 금지, 의문형 + 3선택지 + 영향분석 + 사용자 위임. CLAUDE.md Agent Policy 추가.` | LLM 응답 스타일 가이드라인. 게이트 아닌 prompt 엔지니어링 영역. |
| 6 | 보고 포맷 장황 | `terse(5~10줄) / normal / detailed 3-mode 보고 시스템. 기본 terse, 사용자 요청 시 모드 전환.` | 응답 길이 정량 기준 가능하나 본 게이트 범위(batch 실행) 밖. |

**총 4건** Sprint 7 이관. 반성 3, 4 만 본 게이트(G1~G3) 로 커버.

---

## 적용 시점

- **Sprint 6 잔여 기간**: 본 문서 검토 + DevOps SKILL.md 강화와 통합 검증 (Day 11~14)
- **Sprint 7 Day 1**: 본 게이트 자동화 스니펫을 SKILL.md 에 반영 + orchestrator 스크립트에 wire-up
- **Sprint 7 적용 완료 후**: MEMORY.md 의 batch-battle 항목에 "검증 게이트 G1~G3 운영 중" 한 줄 추가

---

**작성**: QA Agent (Opus 4.7 xhigh)
**작성일**: 2026-04-20 (Day 10)
**참조 자료**: 리포트 63 Part 3 반성 6건, 장애보고서 2건 (2026-04-19, 2026-04-20)
