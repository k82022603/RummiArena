#!/bin/bash
# v6 Smoke 자동 monitor loop — 15분 주기 자율 감시
# 애벌레 지시 2026-04-19: Claude main 개입 제거, bash 백그라운드로 자율 감시
# set -e 금지 (loop 중단 방지), set -uo pipefail 사용
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BATCH_PID_FILE="/tmp/v6-smoke-10runs-pid.txt"
MONITORING_DOC="$REPO_ROOT/work_logs/ai-battle-monitoring-$(date +%Y%m%d).md"
MONITOR_LOG="/tmp/v6-monitor-internal.log"
INCIDENT_COUNTER=0

# 배치 PID 읽기
BATCH_PID=""
if [ -f "$BATCH_PID_FILE" ]; then
  BATCH_PID=$(grep -oP 'BATCH_PID=\K[0-9]+' "$BATCH_PID_FILE" 2>/dev/null || echo "")
fi

if [ -z "$BATCH_PID" ]; then
  echo "[$(date '+%F %T')] ERROR: BATCH_PID 파일을 읽을 수 없음: $BATCH_PID_FILE" | tee -a "$MONITOR_LOG"
  exit 1
fi

# 최신 배치 LogDir 자동 감지 (r11-smoke-* 최신)
LOG_DIR=$(ls -dt "$REPO_ROOT"/work_logs/battles/r11-smoke-2* 2>/dev/null | head -1)
if [ -z "$LOG_DIR" ]; then
  echo "[$(date '+%F %T')] ERROR: r11-smoke-* 디렉토리 없음" | tee -a "$MONITOR_LOG"
  exit 1
fi

MASTER_LOG="$LOG_DIR/phase2-master.log"
BATCH_TAG=$(basename "$LOG_DIR")

echo "[$(date '+%F %T')] monitor loop 시작 — BatchTag=$BATCH_TAG BATCH_PID=$BATCH_PID" | tee -a "$MONITOR_LOG"
echo "[$(date '+%F %T')] LOG_DIR=$LOG_DIR" | tee -a "$MONITOR_LOG"
echo "[$(date '+%F %T')] MONITORING_DOC=$MONITORING_DOC" | tee -a "$MONITOR_LOG"

# ----------------------------------------------------------------
# 구간별 latency 계산 함수 (awk, Python 없이)
# $1=start_turn $2=end_turn $3=AI_LINES_FILE (tmpfile)
# ----------------------------------------------------------------
compute_stats() {
  local start=$1
  local end=$2
  local tmpfile=$3
  awk -v s="$start" -v e="$end" '
    match($0, /T0*([0-9]+) AI\(seat 1\).*\[([0-9]+(\.[0-9]+)?)s\]/, m) {
      t = m[1]+0
      if (t >= s && t <= e) {
        vals[++n] = m[2]+0
        sum += m[2]+0
        if (m[2]+0 > maxv) maxv = m[2]+0
      }
    }
    END {
      if (n == 0) { print "n=0"; exit }
      avg = sum / n
      asort(vals)
      p95_idx = int(n * 0.95 + 0.5)
      if (p95_idx < 1) p95_idx = 1
      if (p95_idx > n) p95_idx = n
      printf "n=%d avg=%.0fs p95=%.0fs max=%.0fs", n, avg, vals[p95_idx], maxv
    }' "$tmpfile" 2>/dev/null || echo "n=0"
}

# ----------------------------------------------------------------
# 메인 루프
# ----------------------------------------------------------------
while true; do
  TS=$(date '+%F %T')

  # 1. 배치 프로세스 생존 확인
  if ! ps -p "$BATCH_PID" > /dev/null 2>&1; then
    # 정상 완료 여부 확인
    if [ -f "$MASTER_LOG" ] && grep -q "Batch 완료" "$MASTER_LOG" 2>/dev/null; then
      echo "[$TS] 배치 정상 완료 — monitor loop 종료" | tee -a "$MONITOR_LOG"
      {
        echo ""
        echo "### 완료 알림 [$TS KST]"
        echo ""
        echo "배치 정상 완료. monitor loop 종료."
      } >> "$MONITORING_DOC"
      break
    else
      echo "[$TS] CRASH: 배치 프로세스 없음 (PID $BATCH_PID), 완료 표시 없음" | tee -a "$MONITOR_LOG"
      echo "CRASH @ $TS" > "$REPO_ROOT/work_logs/incidents/CRASH_FLAG.txt"
      {
        echo ""
        echo "### 긴급: 배치 크래시 감지 [$TS KST]"
        echo ""
        echo "- PID $BATCH_PID 부재, 완료 표시 없음"
        echo "- CRASH_FLAG.txt 생성됨"
      } >> "$MONITORING_DOC"
      break
    fi
  fi

  # 2. 현재 진행 중 Run 로그 탐지 (가장 최근 run 로그)
  CURRENT_RUN_LOG=$(ls -t "$LOG_DIR"/phase2-run*.log 2>/dev/null | head -1)
  if [ -z "$CURRENT_RUN_LOG" ]; then
    echo "[$TS] 아직 run 로그 없음 (배치 초기화 중)" | tee -a "$MONITOR_LOG"
    sleep 900
    continue
  fi

  RUN_NAME=$(basename "$CURRENT_RUN_LOG" .log)
  # phase2-run{N}-{shaper} 형식
  RUN_NUM=$(echo "$RUN_NAME" | grep -oP 'run\K[0-9]+' || echo "?")
  SHAPER=$(echo "$RUN_NAME" | sed 's/phase2-run[0-9]*-//' || echo "unknown")

  # 3. 턴별 집계용 임시파일
  TMP_AILINES=$(mktemp /tmp/v6-monitor-ailines.XXXXXX)
  grep -E "T[0-9]+ AI\(seat 1\):" "$CURRENT_RUN_LOG" > "$TMP_AILINES" 2>/dev/null || true

  # awk 로 집계 (grep -c 는 pipefail 환경에서 || echo "0" 와 결합 시 "00" 버그 발생)
  TOTAL_AI=$(awk 'END{print NR+0}' "$TMP_AILINES" 2>/dev/null || echo "0")
  PLACE_COUNT=$(awk '/PLACE/{n++} END{print n+0}' "$TMP_AILINES" 2>/dev/null || echo "0")
  DRAW_COUNT=$(awk '/DRAW \[/{n++} END{print n+0}' "$TMP_AILINES" 2>/dev/null || echo "0")
  FALLBACK_COUNT=$(awk 'tolower($0) ~ /fallback|ai_timeout|ws_closed|http_disconnect/{n++} END{print n+0}' "$TMP_AILINES" 2>/dev/null || echo "0")
  CUMUL_TILES=$(awk 'match($0, /cumul=([0-9]+)/, m){last=m[1]+0} END{print last+0}' "$TMP_AILINES" 2>/dev/null || echo "0")

  # 최종 방어: 비정수 입력 차단
  TOTAL_AI=${TOTAL_AI:-0}
  PLACE_COUNT=${PLACE_COUNT:-0}
  DRAW_COUNT=${DRAW_COUNT:-0}
  FALLBACK_COUNT=${FALLBACK_COUNT:-0}
  CUMUL_TILES=${CUMUL_TILES:-0}

  # 4. 구간별 latency
  EARLY=$(compute_stats 1 25 "$TMP_AILINES")
  MID=$(compute_stats 26 55 "$TMP_AILINES")
  LATE=$(compute_stats 56 80 "$TMP_AILINES")

  rm -f "$TMP_AILINES"

  # 5. 활성 게임 수 (kubectl 실패 시 0 fallback)
  ACTIVE_GAMES=$(kubectl exec -n rummikub deploy/redis -- redis-cli --scan --pattern "game:*" 2>/dev/null | awk '/game:/{n++} END{print n+0}' || echo "0")
  ACTIVE_GAMES=${ACTIVE_GAMES:-0}

  # 6. 비용 (Redis quota, kubectl 실패 시 기본값)
  COST_RAW=$(kubectl -n rummikub exec deploy/redis -- redis-cli HGET "quota:daily:$(date -u +%Y-%m-%d)" total_cost_usd 2>/dev/null || echo "0")
  COST_RAW=${COST_RAW:-0}
  COST_USD=$(awk -v c="$COST_RAW" 'BEGIN{ if(c+0==0) print "0.0000"; else printf "%.4f", c/1000000 }' 2>/dev/null || echo "0.0000")

  # 7. place_rate 중간값
  if [ "${TOTAL_AI:-0}" -gt 0 ]; then
    PLACE_RATE=$(awk -v p="$PLACE_COUNT" -v t="$TOTAL_AI" 'BEGIN{ printf "%.1f", p*100/t }' 2>/dev/null || echo "0.0")
  else
    PLACE_RATE="0.0"
  fi

  # 8. 경과 시간
  ELAPSED=$(ps -p "$BATCH_PID" -o etime= 2>/dev/null | xargs 2>/dev/null || echo "unknown")

  # 9. sanity 판정 (passthrough Run 만, AI 턴 30개 이상일 때)
  VERDICT="—"
  if [[ "$SHAPER" == "passthrough" ]] && [ "${TOTAL_AI:-0}" -gt 30 ]; then
    # v2 baseline 29.07% ± 2.45%p → 26.6~31.5%
    VERDICT=$(awk -v p="$PLACE_RATE" 'BEGIN{
      if (p+0 < 26.6) print "이탈-하"
      else if (p+0 > 32.0) print "이탈-상"
      else print "PASS"
    }' 2>/dev/null || echo "—")
  fi

  # 10. 모니터링 문서 append
  {
    echo ""
    echo "### 스냅샷 [$TS KST]"
    echo ""
    echo "| 항목 | 값 |"
    echo "|------|-----|"
    echo "| Run | ${RUN_NUM}/10 (${SHAPER}) |"
    echo "| 경과 | ${ELAPSED} |"
    echo "| AI 턴 n | ${TOTAL_AI} |"
    echo "| place / draw / fallback | ${PLACE_COUNT} / ${DRAW_COUNT} / ${FALLBACK_COUNT} |"
    echo "| cumul tiles | ${CUMUL_TILES} |"
    echo "| place_rate 중간 | ${PLACE_RATE}% |"
    echo "| 초반 T1-25 | ${EARLY} |"
    echo "| 중반 T26-55 | ${MID} |"
    echo "| 후반 T56-80 | ${LATE} |"
    echo "| 활성 게임 | ${ACTIVE_GAMES} |"
    echo "| 비용 누적 | \$${COST_USD} / \$20 |"
    echo "| sanity | ${VERDICT} |"
  } >> "$MONITORING_DOC"

  echo "[$TS] 스냅샷 기록 — Run${RUN_NUM}(${SHAPER}) AI턴=${TOTAL_AI} place/draw/fb=${PLACE_COUNT}/${DRAW_COUNT}/${FALLBACK_COUNT} rate=${PLACE_RATE}% verdict=${VERDICT}" | tee -a "$MONITOR_LOG"

  # 11. fallback 1건 이상 발생 시 장애보고서 자동 생성
  FB_INT=${FALLBACK_COUNT:-0}
  if [ "$FB_INT" -gt "$INCIDENT_COUNTER" ]; then
    NEW_CASES=$(( FB_INT - INCIDENT_COUNTER ))
    i=0
    while [ "$i" -lt "$NEW_CASES" ]; do
      INC_DATE=$(date +%Y-%m-%d)
      INC_N="01"
      while [ -f "$REPO_ROOT/work_logs/incidents/${INC_DATE}-${INC_N}-timeout.md" ]; do
        INC_N=$(printf '%02d' $(( 10#${INC_N} + 1 )))
      done
      INCIDENT_FILE="$REPO_ROOT/work_logs/incidents/${INC_DATE}-${INC_N}-timeout.md"
      TEMPLATE="$REPO_ROOT/work_logs/incidents/_template-timeout.md"
      if [ -f "$TEMPLATE" ]; then
        cp "$TEMPLATE" "$INCIDENT_FILE"
        # 프리픽스 자동 채우기
        sed -i "s|^- \*\*발생 시각 (KST)\*\*:$|- **발생 시각 (KST)**: ${TS}|" "$INCIDENT_FILE"
        sed -i "s|^- \*\*BatchTag\*\*:$|- **BatchTag**: ${BATCH_TAG}|" "$INCIDENT_FILE"
        sed -i "s|^- \*\*Run N\/M\*\*:$|- **Run N\/M**: ${RUN_NUM}\/10|" "$INCIDENT_FILE"
        sed -i "s|^- \*\*Shaper\*\*:$|- **Shaper**: ${SHAPER}|" "$INCIDENT_FILE"
      else
        echo "[$TS] WARNING: 템플릿 없음 — 빈 장애보고서 생성: $INCIDENT_FILE" | tee -a "$MONITOR_LOG"
        {
          echo "# 장애 보고서 (자동 생성) — $TS"
          echo "- **발생 시각 (KST)**: $TS"
          echo "- **BatchTag**: $BATCH_TAG"
          echo "- **Run N/M**: ${RUN_NUM}/10"
          echo "- **Shaper**: $SHAPER"
          echo ""
          echo "> 템플릿 미발견. 수동 보강 필요."
        } > "$INCIDENT_FILE"
      fi
      echo "[$TS] FALLBACK 감지 → 장애보고서 생성: $INCIDENT_FILE (수동 보강 필요)" | tee -a "$MONITOR_LOG"
      # 모니터링 문서에도 기록
      {
        echo ""
        echo "#### FALLBACK 장애보고서 생성: $INCIDENT_FILE"
      } >> "$MONITORING_DOC"
      i=$(( i + 1 ))
    done
    INCIDENT_COUNTER=$FB_INT
  fi

  # 12. 긴급 flag 조건
  # 12a. 후반 p95 > 500s
  # NOTE (2026-04-21): Task #19 (gpt-5-mini turn 80 × 3N 본실측) 은 Kill 확정.
  # 이 경고는 Plan B 본실측 등 향후 배치에도 재사용될 수 있도록 메시지 문자열은 보존한다.
  # 근거: work_logs/decisions/2026-04-21-01-plan-b-activation.md §4
  if echo "$LATE" | grep -qE "p95=[5-9][0-9]{2}s|p95=[0-9]{4,}s" 2>/dev/null; then
    echo "[$TS] WARN: 후반 p95 > 500s ($LATE) — Task #19 timeout 조정 필요 신호" | tee -a "$MONITOR_LOG"
  fi

  # 12b. fallback 연속 3건 이상
  if [ "${FB_INT:-0}" -ge 3 ]; then
    echo "[$TS] URGENT: fallback 연속 3건 이상 (${FB_INT}건) — 배치 중단 검토" | tee -a "$MONITOR_LOG"
    touch "$REPO_ROOT/work_logs/incidents/URGENT_FALLBACK_FLAG.txt"
    {
      echo ""
      echo "#### URGENT: fallback ${FB_INT}건 — URGENT_FALLBACK_FLAG.txt 생성"
    } >> "$MONITORING_DOC"
  fi

  # 12c. sanity 이탈
  if [[ "$VERDICT" == "이탈-상" || "$VERDICT" == "이탈-하" ]]; then
    echo "[$TS] WARN: passthrough sanity 이탈 ($VERDICT) place_rate=${PLACE_RATE}% — v2 bitwise 전제 위반 가능성" | tee -a "$MONITOR_LOG"
    {
      echo ""
      echo "#### WARN: sanity 이탈 ($VERDICT) place_rate=${PLACE_RATE}%"
    } >> "$MONITORING_DOC"
  fi

  # 12d. 활성 게임 2개 이상 (좀비 의심)
  if [ "${ACTIVE_GAMES:-0}" -ge 2 ]; then
    echo "[$TS] WARN: 활성 게임 ${ACTIVE_GAMES}개 — 좀비 의심" | tee -a "$MONITOR_LOG"
  fi

  # 13. 15분 sleep
  echo "[$TS] 다음 체크까지 15분 대기..." | tee -a "$MONITOR_LOG"
  sleep 900
done

echo "[$(date '+%F %T')] v6 monitor loop 종료" | tee -a "$MONITOR_LOG"
