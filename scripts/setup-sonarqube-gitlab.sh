#!/usr/bin/env bash
# scripts/setup-sonarqube-gitlab.sh
# SonarQube 초기 설정 + GitLab CI Variables 등록
#
# 사전 조건:
#   - SonarQube: http://localhost:9001 (lts-community 컨테이너 실행 중)
#   - glab: ~/.local/bin/glab (gitlab.com 인증 완료)
#   - GITHUB_TOKEN: 환경변수에 설정됨
#
# 사용법:
#   bash scripts/setup-sonarqube-gitlab.sh
#   또는 단계별 실행:
#   bash scripts/setup-sonarqube-gitlab.sh --step=1  (SonarQube만)
#   bash scripts/setup-sonarqube-gitlab.sh --step=2  (GitLab Variables만)
#   bash scripts/setup-sonarqube-gitlab.sh --step=3  (Runner dry-run만)

set -euo pipefail

SONAR_URL="http://localhost:9001"
SONAR_OLD_PW="admin"
SONAR_NEW_PW="RummiAdmin2026!"
GITLAB_REPO="k82022603/RummiArena"
GLAB_BIN="$HOME/.local/bin/glab"

# 단계 선택 (기본: 전체 실행)
STEP="${1:-all}"

# --------------------------------------------------
# 색상 출력
# --------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC} $*"; }
info() { echo -e "${YELLOW}[INFO]${NC} $*"; }

# --------------------------------------------------
# 함수: SonarQube 응답 체크
# --------------------------------------------------
sonar_check() {
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -u "admin:${SONAR_NEW_PW}" "${SONAR_URL}/api/system/status")
    if [[ "$http_code" == "200" ]]; then
        ok "SonarQube 연결 정상 (HTTP $http_code)"
        return 0
    else
        err "SonarQube 연결 실패 (HTTP $http_code)"
        return 1
    fi
}

# ==============================================================================
# TASK 1: SonarQube 초기 설정
# ==============================================================================
task_sonarqube() {
    echo ""
    echo "======================================================"
    echo " TASK 1: SonarQube 초기 설정"
    echo "======================================================"

    # 1-1. admin 비밀번호 변경
    info "1-1. admin 비밀번호 변경 중..."
    PW_RESP=$(curl -s -w "\n%{http_code}" -u "admin:${SONAR_OLD_PW}" -X POST \
        "${SONAR_URL}/api/users/change_password" \
        -d "login=admin&previousPassword=${SONAR_OLD_PW}&password=${SONAR_NEW_PW}" 2>&1)
    PW_CODE=$(echo "$PW_RESP" | tail -1)

    if [[ "$PW_CODE" == "204" ]]; then
        ok "비밀번호 변경 성공 (HTTP $PW_CODE)"
    elif [[ "$PW_CODE" == "400" ]]; then
        # 이미 변경된 경우 (이전 실행)
        info "이미 변경된 비밀번호이거나 오류 (HTTP $PW_CODE) — 새 비밀번호로 연결 재시도"
    else
        err "비밀번호 변경 응답: HTTP $PW_CODE"
        echo "응답 본문: $(echo "$PW_RESP" | head -1)"
    fi

    # 새 비밀번호 연결 확인
    sonar_check || { err "SonarQube에 접속할 수 없습니다. 컨테이너 상태를 확인하세요."; exit 1; }

    # 1-2. 프로젝트 3개 생성
    echo ""
    info "1-2. 프로젝트 3개 생성 중..."

    for proj in "game-server:rummiarena-game-server" "ai-adapter:rummiarena-ai-adapter" "frontend:rummiarena-frontend"; do
        NAME="${proj%%:*}"
        KEY="${proj##*:}"

        RESP=$(curl -s -u "admin:${SONAR_NEW_PW}" -X POST \
            "${SONAR_URL}/api/projects/create" \
            -d "name=${NAME}&project=${KEY}&visibility=public" 2>&1)

        # 이미 존재하는 경우: {"errors":[{"msg":"Could not create Project, key already exists: ..."}]}
        if echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'project' in d else 1)" 2>/dev/null; then
            PKEY=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['project']['key'])")
            ok "프로젝트 생성: $PKEY"
        elif echo "$RESP" | grep -q "already exists"; then
            ok "프로젝트 이미 존재: $KEY (재사용)"
        else
            err "프로젝트 생성 실패: $NAME"
            echo "응답: $RESP"
        fi
    done

    # 1-3. CI용 Global Analysis Token 생성
    echo ""
    info "1-3. CI용 GLOBAL_ANALYSIS_TOKEN 생성 중..."

    TOKEN_RESP=$(curl -s -u "admin:${SONAR_NEW_PW}" -X POST \
        "${SONAR_URL}/api/user_tokens/generate" \
        -d "name=gitlab-ci-token&type=GLOBAL_ANALYSIS_TOKEN" 2>&1)

    if echo "$TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'token' in d else 1)" 2>/dev/null; then
        SONAR_TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['token'])")
        ok "SONAR_TOKEN 생성 성공: ${SONAR_TOKEN:0:10}..."
        # 이후 Task 2에서 사용하기 위해 파일에 임시 저장 (퍼미션 600)
        echo "$SONAR_TOKEN" > /tmp/.sonar_token_temp
        chmod 600 /tmp/.sonar_token_temp
        info "토큰을 /tmp/.sonar_token_temp 에 임시 저장 (Task 2 완료 후 자동 삭제)"
    elif echo "$TOKEN_RESP" | grep -q "already exists"; then
        err "토큰 이름 'gitlab-ci-token' 이 이미 존재합니다."
        info "기존 토큰을 삭제하고 재생성합니다..."

        # 기존 토큰 삭제
        curl -s -u "admin:${SONAR_NEW_PW}" -X POST \
            "${SONAR_URL}/api/user_tokens/revoke" \
            -d "name=gitlab-ci-token" > /dev/null 2>&1

        # 재생성
        TOKEN_RESP2=$(curl -s -u "admin:${SONAR_NEW_PW}" -X POST \
            "${SONAR_URL}/api/user_tokens/generate" \
            -d "name=gitlab-ci-token&type=GLOBAL_ANALYSIS_TOKEN" 2>&1)

        SONAR_TOKEN=$(echo "$TOKEN_RESP2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
        if [[ -n "$SONAR_TOKEN" ]]; then
            ok "SONAR_TOKEN 재생성 성공: ${SONAR_TOKEN:0:10}..."
            echo "$SONAR_TOKEN" > /tmp/.sonar_token_temp
            chmod 600 /tmp/.sonar_token_temp
        else
            err "토큰 재생성 실패: $TOKEN_RESP2"
            exit 1
        fi
    else
        err "토큰 생성 실패: $TOKEN_RESP"
        exit 1
    fi

    echo ""
    ok "TASK 1 완료 — SonarQube 초기 설정"
}

# ==============================================================================
# TASK 2: GitLab CI Variables 등록
# ==============================================================================
task_gitlab_vars() {
    echo ""
    echo "======================================================"
    echo " TASK 2: GitLab CI Variables 등록"
    echo "======================================================"

    # SONAR_TOKEN 로드 (Task 1에서 생성한 경우)
    if [[ -f /tmp/.sonar_token_temp ]]; then
        SONAR_TOKEN=$(cat /tmp/.sonar_token_temp)
        info "임시 파일에서 SONAR_TOKEN 로드: ${SONAR_TOKEN:0:10}..."
    else
        # Task 2만 단독 실행하는 경우 — 환경변수에서 로드
        if [[ -z "${SONAR_TOKEN:-}" ]]; then
            err "SONAR_TOKEN이 없습니다. Task 1을 먼저 실행하거나 SONAR_TOKEN 환경변수를 설정하세요."
            exit 1
        fi
        info "환경변수에서 SONAR_TOKEN 사용: ${SONAR_TOKEN:0:10}..."
    fi

    # GITHUB_TOKEN 확인
    if [[ -z "${GITHUB_TOKEN:-}" ]]; then
        err "GITHUB_TOKEN 환경변수가 설정되지 않았습니다."
        err "~/.bashrc에서 source ~/.bashrc 후 재실행하세요."
        exit 1
    fi
    ok "GITHUB_TOKEN 확인: ${GITHUB_TOKEN:0:10}..."

    # glab 경로 확인
    if [[ ! -x "$GLAB_BIN" ]]; then
        err "glab을 찾을 수 없습니다: $GLAB_BIN"
        exit 1
    fi
    ok "glab 버전: $($GLAB_BIN version 2>/dev/null | head -1)"

    # 변수 등록 함수
    set_variable() {
        local KEY="$1"
        local VALUE="$2"
        local MASKED="${3:-false}"
        local FLAGS=""
        [[ "$MASKED" == "true" ]] && FLAGS="--masked"

        info "등록 중: $KEY"
        RESULT=$("$GLAB_BIN" variable set "$KEY" \
            --value "$VALUE" \
            $FLAGS \
            --repo "$GITLAB_REPO" 2>&1)
        # 이미 존재하는 경우 update로 재시도
        if echo "$RESULT" | grep -qi "already exists\|already set\|409"; then
            info "$KEY 이미 존재 — update로 덮어씁니다..."
            "$GLAB_BIN" variable update "$KEY" \
                --value "$VALUE" \
                $FLAGS \
                --repo "$GITLAB_REPO" 2>&1 && ok "$KEY 업데이트 완료" || err "$KEY 업데이트 실패"
        elif echo "$RESULT" | grep -qi "error\|Error"; then
            err "$KEY 등록 실패: $RESULT"
        else
            ok "$KEY 등록 완료"
        fi
    }

    # SONAR_HOST_URL
    set_variable "SONAR_HOST_URL" "http://host.docker.internal:9001"

    # SONAR_TOKEN (masked)
    set_variable "SONAR_TOKEN" "$SONAR_TOKEN" "true"

    # GITOPS_TOKEN (masked) — GITHUB_TOKEN 재사용
    set_variable "GITOPS_TOKEN" "$GITHUB_TOKEN" "true"

    # 등록된 변수 목록 확인
    echo ""
    info "등록된 CI/CD Variables 목록:"
    "$GLAB_BIN" variable list --repo "$GITLAB_REPO" 2>&1

    # 임시 토큰 파일 삭제
    if [[ -f /tmp/.sonar_token_temp ]]; then
        rm -f /tmp/.sonar_token_temp
        ok "임시 토큰 파일 삭제 완료"
    fi

    echo ""
    ok "TASK 2 완료 — GitLab CI Variables 등록"
}

# ==============================================================================
# TASK 3: GitLab Runner Helm dry-run 검증
# ==============================================================================
task_runner_dryrun() {
    echo ""
    echo "======================================================"
    echo " TASK 3: GitLab Runner Helm dry-run 검증"
    echo "======================================================"

    HELM_VALUES="/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/helm/charts/gitlab-runner/values.yaml"

    # Helm repo 추가/업데이트
    info "Helm repo 추가 (gitlab)..."
    helm repo add gitlab https://charts.gitlab.io 2>&1 | tail -2 || true
    helm repo update gitlab 2>&1 | tail -2

    # cicd namespace 생성 (dry-run)
    info "cicd namespace 확인/생성..."
    kubectl create namespace cicd --dry-run=client -o yaml | kubectl apply -f - 2>&1
    ok "cicd namespace 준비 완료"

    # Helm dry-run
    info "GitLab Runner Helm dry-run 실행..."
    DRY_RUN_RESULT=$(helm install gitlab-runner gitlab/gitlab-runner \
        -n cicd \
        -f "$HELM_VALUES" \
        --set runnerToken="DRY_RUN_PLACEHOLDER_TOKEN" \
        --dry-run 2>&1)
    DRY_RUN_EXIT=$?

    if [[ $DRY_RUN_EXIT -eq 0 ]]; then
        ok "Helm dry-run 성공"
        echo ""
        echo "--- dry-run 출력 (마지막 25줄) ---"
        echo "$DRY_RUN_RESULT" | tail -25
    else
        err "Helm dry-run 실패 (exit $DRY_RUN_EXIT)"
        echo "$DRY_RUN_RESULT" | tail -30
        echo ""
        info "이미 설치된 경우 아래 명령으로 업그레이드 dry-run:"
        info "  helm upgrade gitlab-runner gitlab/gitlab-runner -n cicd -f $HELM_VALUES --set runnerToken=PLACEHOLDER --dry-run"
    fi

    echo ""
    ok "TASK 3 완료 — Runner dry-run 검증"
}

# ==============================================================================
# 최종 요약 출력
# ==============================================================================
print_summary() {
    echo ""
    echo "======================================================"
    echo " 최종 설정 요약"
    echo "======================================================"
    echo ""
    echo "  SonarQube URL   : $SONAR_URL"
    echo "  SonarQube 계정  : admin / RummiAdmin2026!"
    echo "  프로젝트 Keys   :"
    echo "    - rummiarena-game-server"
    echo "    - rummiarena-ai-adapter"
    echo "    - rummiarena-frontend"
    echo ""
    echo "  GitLab Variables:"
    echo "    - SONAR_HOST_URL = http://host.docker.internal:9001"
    echo "    - SONAR_TOKEN    = (masked)"
    echo "    - GITOPS_TOKEN   = (masked)"
    echo ""
    echo "  다음 단계:"
    echo "    1. GitLab 프로젝트 설정 → CI/CD → Runners → New project runner"
    echo "       태그: kubernetes,rummiarena"
    echo "    2. 발급된 Runner 토큰으로 helm install:"
    echo "       helm install gitlab-runner gitlab/gitlab-runner \\"
    echo "         -n cicd --create-namespace \\"
    echo "         -f helm/charts/gitlab-runner/values.yaml \\"
    echo "         --set runnerToken=\"<실제토큰>\""
    echo "    3. kubectl get pods -n cicd 로 Runner Pod 확인"
    echo ""
}

# ==============================================================================
# 메인 실행
# ==============================================================================
main() {
    echo ""
    echo "======================================================"
    echo " RummiArena — SonarQube & GitLab CI 설정 스크립트"
    echo " 실행 모드: ${STEP}"
    echo "======================================================"

    case "$STEP" in
        "--step=1"|"step1"|"sonar")
            task_sonarqube
            ;;
        "--step=2"|"step2"|"gitlab")
            task_gitlab_vars
            ;;
        "--step=3"|"step3"|"runner")
            task_runner_dryrun
            ;;
        "all"|"")
            task_sonarqube
            task_gitlab_vars
            task_runner_dryrun
            print_summary
            ;;
        *)
            err "알 수 없는 옵션: $STEP"
            echo "사용법: $0 [--step=1|--step=2|--step=3|all]"
            exit 1
            ;;
    esac
}

main
