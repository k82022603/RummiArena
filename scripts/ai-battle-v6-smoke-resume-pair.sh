#!/bin/bash
# v6 Smoke Resume: pair-warmup x4 (Run 7~10)
#
# 배경:
#   BatchTag r11-smoke-20260419-153217 에서 Run 1~6 완료 (passthrough x2, joker-hinter x4).
#   Run 7 이 2026-04-20 07:28 네트워크 변경으로 중단됨.
#   joker-hinter N=3 평균 27.3% 이미 확보 (Kill 확증) → Run 6 재실행 불요.
#   pair-warmup 4회 (Run 7~10) 만 resume.
#
# 기존 BatchTag/LogDir 재사용 (master.log 에 resume 섹션 append).
#
# batch-battle SKILL Phase 1~4 준수:
#   Phase 1: 사전점검 (Pod/health/configmap)
#   Phase 2: 매 run 전 Redis game 키 정리
#   Phase 3: 순차 실행 + PIPESTATUS/argparse grep/10분 조기종료/연속2실패 4중 방어
#   Phase 4: 배치 종료 시 env 원복 (passthrough)
#
# KDP #7 타임아웃 부등식 (docs/02-design/41):
#   script_ws(770) > gs_ctx(760) > http_client(760) > istio_vs(710)
#   > DTO_max(720) > adapter_floor(700) > llm_vendor
#
# 실행:
#   chmod +x scripts/ai-battle-v6-smoke-resume-pair.sh
#   nohup bash scripts/ai-battle-v6-smoke-resume-pair.sh > /tmp/v6-smoke-resume-pair-nohup.log 2>&1 &
#   disown $!
#
# 예상 소요: ~10시간 (pair-warmup x4 x 80턴, 각 ~150분 + 쿨다운 30s)
# 예상 비용: ~$0.16 (DeepSeek Reasoner x4 x $0.04)
# 판단 기준 (ADR 44 §10.3):
#   GO    : place_rate >= 31% (vs v2 N=3 mean 29.07%, Delta >= +2%p)
#   Pivot : 27% <= place_rate < 31%
#   Kill  : place_rate < 27%

set -uo pipefail  # -e 제거: 한 run 실패해도 다음 계속

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 기존 BatchTag 재사용 (master.log append)
BATCH_TAG="r11-smoke-20260419-153217"
LOG_DIR="$REPO_ROOT/work_logs/battles/$BATCH_TAG"
MASTER_LOG="$LOG_DIR/phase2-master.log"

# pair-warmup x4: Run 7~10
SEQUENCE=("pair-warmup" "pair-warmup" "pair-warmup" "pair-warmup")
START_RUN=7
TOTAL_RUNS=10

TURNS=80
TIMEOUT=700

# master.log 가 없으면 에러 (resume 이므로 반드시 존재해야 함)
if [ ! -f "$MASTER_LOG" ]; then
  echo "[ERROR] master.log 없음: $MASTER_LOG"
  echo "  기존 BatchTag 디렉토리가 존재하지 않습니다. 경로를 확인하세요."
  exit 1
fi

{
  echo ""
  echo "===== Resume 시작 $(date '+%F %T') (Run 7~10 pair-warmup) ====="
  echo "  BatchTag : $BATCH_TAG"
  echo "  LogDir   : $LOG_DIR"
  echo "  Sequence : ${SEQUENCE[*]}"
  echo "  StartRun : $START_RUN"
  echo "  Turns    : $TURNS"
  echo "  Timeout  : ${TIMEOUT}s"
  echo "  MasterLog: $MASTER_LOG (append 모드)"
  echo ""
  echo "  재개 이유: Run 6 종료 후 Run 7 pair-warmup 이 네트워크 변경으로 07:28 중단"
  echo "  중단 로그 백업: phase2-run7-pair-warmup.log.aborted-20260420-0728"
} | tee -a "$MASTER_LOG"

# Phase 1: 사전점검 (batch-battle SKILL §Phase 1)
{
  echo "[$(date '+%F %T')] ===== Phase 1 Resume 사전점검 ====="
} | tee -a "$MASTER_LOG"

# Pod 상태
POD_STATUS=$(kubectl get pods -n rummikub --no-headers 2>&1)
POD_COUNT=$(echo "$POD_STATUS" | grep -c "Running" || true)
{
  echo "[$(date '+%F %T')] Pods Running: $POD_COUNT"
  echo "$POD_STATUS"
} | tee -a "$MASTER_LOG"

if [ "$POD_COUNT" -lt 5 ]; then
  echo "[ERROR] Running Pod 수 부족 ($POD_COUNT < 5). 배치 중단." | tee -a "$MASTER_LOG"
  exit 1
fi

# game-server health
GS_READY=$(curl -s --max-time 10 http://localhost:30080/ready 2>/dev/null || echo "FAIL")
{
  echo "[$(date '+%F %T')] game-server /ready: $GS_READY"
} | tee -a "$MASTER_LOG"

# ai-adapter 비용/타임아웃/SHAPER 확인
{
  echo "[$(date '+%F %T')] ai-adapter 설정 (현재):"
  kubectl exec -n rummikub deploy/ai-adapter -- printenv 2>/dev/null \
    | grep -iE "COST_LIMIT|SHAPER|TIMEOUT" | sort | sed 's/^/  /'
} | tee -a "$MASTER_LOG"

# Redis game 키 사전 점검
GAME_KEYS_PRE=$(kubectl exec -n rummikub deploy/redis -- redis-cli --scan --pattern "game:*" 2>/dev/null | wc -l || echo "0")
{
  echo "[$(date '+%F %T')] Redis game:* 키 수 (사전): $GAME_KEYS_PRE"
} | tee -a "$MASTER_LOG"

if [ "$GAME_KEYS_PRE" -gt 0 ]; then
  kubectl exec -n rummikub deploy/redis -- sh -c \
    'redis-cli --scan --pattern "game:*" | xargs -r redis-cli DEL' 2>/dev/null || true
  echo "[$(date '+%F %T')] Phase 1: Redis game:* 키 사전 정리 완료" | tee -a "$MASTER_LOG"
fi

# dry-run 검증 (SKILL Phase 1 체크리스트 #8 — argparse 오류 사전 방지)
{
  echo "[$(date '+%F %T')] dry-run 검증 (argparse 오류 사전 방지)..."
} | tee -a "$MASTER_LOG"

DRY_OUT=$(python3 "$REPO_ROOT/scripts/ai-battle-3model-r4.py" --models deepseek --max-turns "$TURNS" --dry-run 2>&1)
DRY_RC=$?
if [ "$DRY_RC" -ne 0 ] || echo "$DRY_OUT" | grep -qE "unrecognized arguments|ArgumentError|Traceback|error:"; then
  echo "[ERROR] dry-run 실패. 스크립트 인자 오류 가능성." | tee -a "$MASTER_LOG"
  echo "$DRY_OUT" | tee -a "$MASTER_LOG"
  exit 1
fi
echo "[$(date '+%F %T')] dry-run OK" | tee -a "$MASTER_LOG"

{
  echo "[$(date '+%F %T')] ===== Phase 1 Resume 완료 ====="
  echo ""
} | tee -a "$MASTER_LOG"

# Phase 3: Run 순차 실행 (Run 7~10)
PASS_COUNT=0
FAIL_COUNT=0

for i in "${!SEQUENCE[@]}"; do
  IDX=$((START_RUN + i))       # 7, 8, 9, 10
  SEQ_IDX=$((i + 1))           # 1, 2, 3, 4 (sequence 내 순서)
  SHAPER="${SEQUENCE[$i]}"
  RUN_LOG="$LOG_DIR/phase2-run${IDX}-${SHAPER}.log"

  {
    echo ""
    echo "[$(date '+%F %T')] ===== Run ${IDX}/${TOTAL_RUNS} 시작 (shaper=$SHAPER, resume seq=${SEQ_IDX}/4) ====="
  } | tee -a "$MASTER_LOG"

  # Phase 2: 매 run 전 Redis game 키 정리 (batch-battle SKILL §Phase 2)
  GAME_KEYS_BEFORE=$(kubectl exec -n rummikub deploy/redis -- redis-cli --scan --pattern "game:*" 2>/dev/null | wc -l || echo "0")
  {
    echo "[$(date '+%F %T')] [Phase2] Redis game:* 키 수: $GAME_KEYS_BEFORE"
  } | tee -a "$MASTER_LOG"

  if [ "$GAME_KEYS_BEFORE" -gt 0 ]; then
    kubectl exec -n rummikub deploy/redis -- sh -c \
      'redis-cli --scan --pattern "game:*" | xargs -r redis-cli DEL' 2>/dev/null || true
    echo "[$(date '+%F %T')] [Phase2] Redis game:* 키 삭제 완료" | tee -a "$MASTER_LOG"
  fi

  # ai-battle-v6-smoke.sh 실행 (env 전환 + rollout + 실측 포함)
  {
    echo "[$(date '+%F %T')] [Phase3] 실행: bash scripts/ai-battle-v6-smoke.sh $SHAPER $TURNS $TIMEOUT"
  } | tee -a "$MASTER_LOG"

  START_EPOCH=$(date +%s)

  # (A) PIPESTATUS 로 tee 마스킹 제거 — wrapper 내부에서 이미 처리하지만 orchestrator 에서도 체크
  bash "$REPO_ROOT/scripts/ai-battle-v6-smoke.sh" "$SHAPER" "$TURNS" "$TIMEOUT" > "$RUN_LOG" 2>&1
  RC=$?

  # (B) argparse/Traceback grep — 조용한 실패 감지
  if grep -qE "unrecognized arguments|ArgumentError|Traceback|error:" "$RUN_LOG" 2>/dev/null; then
    RC=2
    echo "[$(date '+%F %T')] [ERROR] Run $IDX Python 스크립트 오류 감지 (RUN_LOG 참조)" | tee -a "$MASTER_LOG"
  fi

  # (C) 비정상 조기 종료 감지 — 80턴 실측은 최소 600s (10분) 소요
  RUN_ELAPSED=$(( $(date +%s) - START_EPOCH ))
  if [ "$RUN_ELAPSED" -lt 600 ]; then
    RC=3
    echo "[$(date '+%F %T')] [ERROR] Run $IDX 비정상 조기 종료 (elapsed=${RUN_ELAPSED}s < 600s 예상)" | tee -a "$MASTER_LOG"
  fi

  # run 요약 추출 (place_rate, fallback, turns 라인)
  SUMMARY=$(tail -30 "$RUN_LOG" 2>/dev/null | grep -iE "place_rate|place rate|fallback|turns|total|결과" | tail -5 || echo "  (요약 라인 없음 — 전체 로그 확인: $RUN_LOG)")

  {
    echo "[$(date '+%F %T')] === Run ${IDX}/${TOTAL_RUNS} 종료 (shaper=$SHAPER, exit=$RC, elapsed=${RUN_ELAPSED}s) ==="
    if [ -n "$SUMMARY" ]; then
      echo "$SUMMARY" | sed 's/^/  /'
    else
      echo "  (tail 요약 없음)"
    fi
    echo "  상세 로그: $RUN_LOG"
  } | tee -a "$MASTER_LOG"

  # (D) 연속 2 Run 실패 시 fail-fast (무한 실패 방지)
  if [ "$RC" -eq 0 ]; then
    PASS_COUNT=$((PASS_COUNT+1))
    FAIL_COUNT=0
  else
    FAIL_COUNT=$((FAIL_COUNT+1))
    echo "[WARN] Run ${IDX} 비정상 종료 (exit=$RC). FAIL_COUNT=$FAIL_COUNT" | tee -a "$MASTER_LOG"
    if [ "$FAIL_COUNT" -ge 2 ]; then
      echo "[$(date '+%F %T')] [FATAL] 연속 2 Run 실패 — 배치 중단" | tee -a "$MASTER_LOG"
      break
    fi
  fi

  # 다음 run 전 30초 쿨다운 (마지막 run 제외)
  if [ "$IDX" -lt "$TOTAL_RUNS" ]; then
    echo "[$(date '+%F %T')] [쿨다운] 30초 대기..." | tee -a "$MASTER_LOG"
    sleep 30
  fi
done

# Phase 4: 배치 종료 env 원복 (passthrough)
{
  echo ""
  echo "[$(date '+%F %T')] ===== Phase 4: env 원복 ====="
} | tee -a "$MASTER_LOG"

kubectl set env deploy/ai-adapter -n rummikub DEEPSEEK_REASONER_CONTEXT_SHAPER=passthrough >> "$MASTER_LOG" 2>&1 || true
kubectl rollout status deploy/ai-adapter -n rummikub --timeout=2m >> "$MASTER_LOG" 2>&1 || true

FINAL_SHAPER=$(kubectl exec -n rummikub deploy/ai-adapter -- printenv DEEPSEEK_REASONER_CONTEXT_SHAPER 2>/dev/null || echo "확인 실패")

{
  echo "[$(date '+%F %T')] env 원복 완료: DEEPSEEK_REASONER_CONTEXT_SHAPER=$FINAL_SHAPER"
  echo ""
  echo "[$(date '+%F %T')] ===== v6 Smoke Resume pair-warmup 완료 ====="
  echo "  Pass (이번 resume): $PASS_COUNT / 4"
  echo "  Fail (이번 resume): $FAIL_COUNT / 4"
  echo "  BatchTag : $BATCH_TAG"
  echo "  LogDir   : $LOG_DIR"
  echo "  MasterLog: $MASTER_LOG"
  echo ""
  echo "  모니터링 명령:"
  echo "    tail -f $MASTER_LOG"
  echo "    ls $LOG_DIR"
} | tee -a "$MASTER_LOG"
