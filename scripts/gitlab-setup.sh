#!/usr/bin/env bash
# scripts/gitlab-setup.sh
# RummiArena GitLab 환경 통합 설정 스크립트
#
# Task:
#   auth            — glab CLI 인증 (glab auth login)
#   install-glab    — glab CLI 설치 (GitHub Releases 최신 버전)
#   create-project  — GitLab 프로젝트 생성 + GitHub 미러 remote 추가
#   set-vars        — CI/CD Variables 등록 (SONAR_HOST_URL, SONAR_TOKEN, GITOPS_TOKEN)
#   install-runner  — GitLab Runner K8s Executor Helm 설치 (토큰 파라미터)
#   runner-dryrun   — GitLab Runner Helm dry-run 검증
#   status          — 설치 상태 전체 확인
#
# 사용법:
#   ./scripts/gitlab-setup.sh install-glab
#   ./scripts/gitlab-setup.sh auth
#   ./scripts/gitlab-setup.sh create-project
#   ./scripts/gitlab-setup.sh set-vars
#   ./scripts/gitlab-setup.sh runner-dryrun
#   RUNNER_TOKEN=glrt-xxx ./scripts/gitlab-setup.sh install-runner
#   ./scripts/gitlab-setup.sh status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RUNNER_VALUES="$PROJECT_ROOT/helm/charts/gitlab-runner/values.yaml"
CICD_NS="cicd"
GLAB_BIN="${HOME}/.local/bin/glab"
GLAB_INSTALL_DIR="${HOME}/.local/bin"
GITLAB_URL="https://gitlab.com"
GITLAB_PROJECT_NAME="RummiArena"
GITLAB_NAMESPACE=""   # 비어 있으면 glab이 인증된 사용자 네임스페이스 사용

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
info() { echo "[INFO]  $*"; }
warn() { echo "[WARN]  $*" >&2; }
err()  { echo "[ERROR] $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# glab 존재 여부 확인
# ---------------------------------------------------------------------------
require_glab() {
  if ! command -v glab >/dev/null 2>&1; then
    warn "glab이 PATH에 없습니다."
    info "먼저 실행하세요: ./scripts/gitlab-setup.sh install-glab"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Task: install-glab — glab CLI 설치 (~/.local/bin)
# ---------------------------------------------------------------------------
install_glab() {
  log "=== glab CLI 설치 ==="

  # 이미 설치됐으면 건너뜀
  if command -v glab >/dev/null 2>&1; then
    local current_ver
    current_ver=$(glab --version 2>/dev/null | head -1 || echo "unknown")
    log "glab 이미 설치됨: $current_ver"
    info "재설치하려면 $GLAB_BIN 파일을 삭제 후 재실행하세요."
    return 0
  fi

  # 최신 버전 확인
  log "GitHub API에서 최신 버전 확인 중..."
  local latest_tag
  latest_tag=$(curl -sf https://api.github.com/repos/gitlab-org/cli/releases/latest \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null) \
    || err "버전 확인 실패. 네트워크를 확인하세요."

  local version="${latest_tag#v}"
  log "최신 버전: v${version}"

  # 다운로드
  local tarball="/tmp/glab_${version}_linux_amd64.tar.gz"
  local extract_dir="/tmp/glab_extract_${version}"

  # GitHub Releases URL 사용 (GitLab CDN보다 안정적)
  # 형식 예: https://github.com/gitlab-org/cli/releases/download/v1.46.1/glab_1.46.1_linux_amd64.tar.gz
  log "다운로드 중: glab v${version} (linux_amd64)..."
  curl -fL \
    "https://github.com/gitlab-org/cli/releases/download/v${version}/glab_${version}_linux_amd64.tar.gz" \
    -o "$tarball" \
    || err "다운로드 실패. URL: https://github.com/gitlab-org/cli/releases/download/v${version}/glab_${version}_linux_amd64.tar.gz"

  # 압축 해제 및 설치
  rm -rf "$extract_dir"
  mkdir -p "$extract_dir"
  tar -xzf "$tarball" -C "$extract_dir"

  # bin/glab 위치 탐색 (배포판마다 경로가 다를 수 있음)
  local glab_bin
  glab_bin=$(find "$extract_dir" -type f -name "glab" | head -1)
  [[ -z "$glab_bin" ]] && err "압축 해제 후 glab 바이너리를 찾을 수 없습니다."

  mkdir -p "$GLAB_INSTALL_DIR"
  cp "$glab_bin" "$GLAB_BIN"
  chmod +x "$GLAB_BIN"

  # 임시 파일 정리
  rm -rf "$tarball" "$extract_dir"

  # PATH 확인
  if ! echo "$PATH" | grep -q "${HOME}/.local/bin"; then
    warn "~/.local/bin 이 PATH에 없습니다."
    info "~/.bashrc 에 다음을 추가하세요:"
    info "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    info "그 후: source ~/.bashrc"
  fi

  # 설치 확인
  "$GLAB_BIN" --version
  log "glab 설치 완료: $GLAB_BIN"
}

# ---------------------------------------------------------------------------
# Task: auth — glab 인증 (glab auth login)
# ---------------------------------------------------------------------------
auth_gitlab() {
  require_glab
  log "=== GitLab 인증 ==="

  info "브라우저가 열리거나 토큰 입력 프롬프트가 나타납니다."
  info "GitLab.com 계정이 없으면 https://gitlab.com/users/sign_up 에서 가입하세요."
  info ""
  info "PAT 발급: GitLab.com → 우측 상단 아바타 → Edit Profile → Access Tokens"
  info "필요 scope: api, read_user, write_repository"
  echo ""

  glab auth login --hostname gitlab.com

  log "인증 상태 확인..."
  glab auth status
}

# ---------------------------------------------------------------------------
# Task: create-project — GitLab 프로젝트 생성 + GitHub remote 추가
# ---------------------------------------------------------------------------
create_project() {
  require_glab
  log "=== GitLab 프로젝트 생성 ==="

  # 인증 확인
  glab auth status >/dev/null 2>&1 || err "GitLab 인증이 필요합니다. 먼저: ./scripts/gitlab-setup.sh auth"

  # 프로젝트 생성 (이미 존재하면 안내)
  info "GitLab.com에 프로젝트 '$GITLAB_PROJECT_NAME' 생성 중..."
  if glab repo create "$GITLAB_PROJECT_NAME" \
      --description "RummiArena: 루미큐브 기반 멀티 LLM 전략 실험 플랫폼" \
      --visibility private \
      --no-clone 2>/dev/null; then
    log "GitLab 프로젝트 생성 완료"
  else
    warn "프로젝트 생성 실패 (이미 존재하거나 권한 문제일 수 있습니다)"
  fi

  # GitLab remote 추가 (GitLab 사용자명 확인)
  local gitlab_user
  gitlab_user=$(glab api "user" --field login 2>/dev/null \
    || glab config get user 2>/dev/null \
    || echo "") \

  if [[ -n "$gitlab_user" ]]; then
    local gitlab_remote="https://gitlab.com/${gitlab_user}/${GITLAB_PROJECT_NAME}.git"
    cd "$PROJECT_ROOT"

    if git remote get-url gitlab >/dev/null 2>&1; then
      log "gitlab remote 이미 존재: $(git remote get-url gitlab)"
    else
      git remote add gitlab "$gitlab_remote"
      log "gitlab remote 추가됨: $gitlab_remote"
    fi

    info ""
    info "GitHub + GitLab 동시 push 설정:"
    info "  git push origin main   # GitHub"
    info "  git push gitlab main   # GitLab (CI 트리거)"
    info ""
    info "또는 origin에 GitLab push URL을 추가해 한 번에 push:"
    info "  git remote set-url --add --push origin $gitlab_remote"
    info "  git remote set-url --add --push origin https://github.com/k82022603/RummiArena.git"
  else
    warn "GitLab 사용자명을 자동으로 확인하지 못했습니다."
    info "수동으로 remote를 추가하세요:"
    info "  git remote add gitlab https://gitlab.com/<YOUR_USERNAME>/${GITLAB_PROJECT_NAME}.git"
  fi
}

# ---------------------------------------------------------------------------
# Task: set-vars — CI/CD Variables 등록
# ---------------------------------------------------------------------------
set_vars() {
  require_glab
  log "=== CI/CD Variables 등록 ==="

  # 인증 확인
  glab auth status >/dev/null 2>&1 || err "GitLab 인증이 필요합니다. 먼저: ./scripts/gitlab-setup.sh auth"

  # 프로젝트 경로 확인
  local gitlab_user
  gitlab_user=$(glab api "user" --field login 2>/dev/null || echo "")
  [[ -z "$gitlab_user" ]] && err "GitLab 사용자명을 확인할 수 없습니다."
  local project_path="${gitlab_user}/${GITLAB_PROJECT_NAME}"

  info "프로젝트: $project_path"
  info ""
  info "등록할 Variables:"
  info "  SONAR_HOST_URL   — SonarQube 서버 URL"
  info "  SONAR_TOKEN      — SonarQube 분석 토큰 (masked)"
  info "  GITOPS_TOKEN     — GitHub PAT (masked)"
  info ""

  # SONAR_HOST_URL
  local sonar_url="${SONAR_HOST_URL:-}"
  if [[ -z "$sonar_url" ]]; then
    read -r -p "SONAR_HOST_URL (기본값: http://host.docker.internal:9000): " sonar_url
    sonar_url="${sonar_url:-http://host.docker.internal:9000}"
  fi

  # SONAR_TOKEN
  local sonar_token="${SONAR_TOKEN:-}"
  if [[ -z "$sonar_token" ]]; then
    info "SonarQube 토큰 발급: SonarQube 웹 UI → Account → Security → Generate Token"
    read -r -s -p "SONAR_TOKEN (입력값 숨김): " sonar_token
    echo ""
  fi
  [[ -z "$sonar_token" ]] && err "SONAR_TOKEN이 필요합니다."

  # GITOPS_TOKEN
  local gitops_token="${GITOPS_TOKEN:-}"
  if [[ -z "$gitops_token" ]]; then
    info "GitHub PAT 발급: GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained"
    info "필요 권한: repo (Contents write, Metadata read)"
    read -r -s -p "GITOPS_TOKEN (입력값 숨김): " gitops_token
    echo ""
  fi
  [[ -z "$gitops_token" ]] && err "GITOPS_TOKEN이 필요합니다."

  log "Variables 등록 중..."

  # SONAR_HOST_URL (비보호, 비마스킹)
  glab api "projects/${project_path//\//%2F}/variables" \
    --method POST \
    --field "key=SONAR_HOST_URL" \
    --field "value=${sonar_url}" \
    --field "protected=false" \
    --field "masked=false" \
    >/dev/null 2>&1 \
    && log "SONAR_HOST_URL 등록 완료" \
    || warn "SONAR_HOST_URL 이미 존재하거나 오류 발생"

  # SONAR_TOKEN (보호, 마스킹)
  glab api "projects/${project_path//\//%2F}/variables" \
    --method POST \
    --field "key=SONAR_TOKEN" \
    --field "value=${sonar_token}" \
    --field "protected=true" \
    --field "masked=true" \
    >/dev/null 2>&1 \
    && log "SONAR_TOKEN 등록 완료" \
    || warn "SONAR_TOKEN 이미 존재하거나 오류 발생"

  # GITOPS_TOKEN (보호, 마스킹)
  glab api "projects/${project_path//\//%2F}/variables" \
    --method POST \
    --field "key=GITOPS_TOKEN" \
    --field "value=${gitops_token}" \
    --field "protected=true" \
    --field "masked=true" \
    >/dev/null 2>&1 \
    && log "GITOPS_TOKEN 등록 완료" \
    || warn "GITOPS_TOKEN 이미 존재하거나 오류 발생"

  # 등록 결과 확인
  log "등록된 Variables 목록:"
  glab api "projects/${project_path//\//%2F}/variables" \
    | python3 -c "
import sys, json
vars = json.load(sys.stdin)
for v in vars:
    masked = '[MASKED]' if v.get('masked') else v.get('value','')
    print(f\"  {v['key']}: {masked}  (protected={v.get('protected',False)})\")
" 2>/dev/null || info "  (목록 조회 실패 — glab api 응답 확인 필요)"
}

# ---------------------------------------------------------------------------
# Task: runner-dryrun — Helm dry-run 검증
# ---------------------------------------------------------------------------
runner_dryrun() {
  log "=== GitLab Runner Helm dry-run ==="

  command -v helm    >/dev/null 2>&1 || err "helm이 설치되어 있지 않습니다."
  command -v kubectl >/dev/null 2>&1 || err "kubectl이 설치되어 있지 않습니다."
  kubectl cluster-info >/dev/null 2>&1 \
    || err "K8s 클러스터에 연결할 수 없습니다. Docker Desktop Kubernetes를 활성화하세요."

  # Helm repo 추가
  log "GitLab Helm repo 추가 중..."
  helm repo add gitlab https://charts.gitlab.io 2>/dev/null || true
  helm repo update gitlab 2>/dev/null || helm repo update

  # cicd 네임스페이스 생성 (idempotent)
  log "cicd 네임스페이스 확인/생성 중..."
  kubectl create namespace "$CICD_NS" --dry-run=client -o yaml | kubectl apply -f -

  # dry-run 실행
  log "dry-run 실행 중 (values: $RUNNER_VALUES)..."
  echo "----------------------------------------------------------------------"
  helm install gitlab-runner gitlab/gitlab-runner \
    -n "$CICD_NS" \
    -f "$RUNNER_VALUES" \
    --dry-run \
    --debug \
    2>&1 | tail -30
  echo "----------------------------------------------------------------------"

  info ""
  info "dry-run 완료. 실제 설치 명령:"
  info "  RUNNER_TOKEN=glrt-xxx ./scripts/gitlab-setup.sh install-runner"
  info ""
  info "또는 setup-cicd.sh 사용:"
  info "  RUNNER_TOKEN=glrt-xxx ./scripts/setup-cicd.sh runner-install"
}

# ---------------------------------------------------------------------------
# Task: install-runner — GitLab Runner K8s Executor 실제 설치
# ---------------------------------------------------------------------------
install_runner() {
  log "=== GitLab Runner Helm 설치 (K8s Executor) ==="

  command -v helm    >/dev/null 2>&1 || err "helm이 설치되어 있지 않습니다."
  command -v kubectl >/dev/null 2>&1 || err "kubectl이 설치되어 있지 않습니다."
  kubectl cluster-info >/dev/null 2>&1 \
    || err "K8s 클러스터에 연결할 수 없습니다."

  # Runner 토큰 확인
  local token="${RUNNER_TOKEN:-}"
  if [[ -z "$token" ]]; then
    info "Runner 토큰 발급 경로:"
    info "  GitLab.com → 프로젝트 → Settings → CI/CD → Runners → New project runner"
    info "  토큰 형식: glrt-xxxxxxxxxxxx"
    read -r -p "Runner 토큰 입력: " token
  fi
  [[ -z "$token" ]] && err "Runner 토큰이 필요합니다."

  # 형식 검증
  if ! echo "$token" | grep -qE '^glrt-'; then
    warn "Runner 토큰 형식이 비표준입니다 (glrt-로 시작해야 합니다)."
    read -r -p "계속 진행하시겠습니까? (y/N): " confirm
    [[ "${confirm,,}" != "y" ]] && exit 0
  fi

  # Helm repo 추가
  helm repo add gitlab https://charts.gitlab.io 2>/dev/null || true
  helm repo update gitlab 2>/dev/null || helm repo update

  # 네임스페이스 생성
  kubectl create namespace "$CICD_NS" --dry-run=client -o yaml | kubectl apply -f -

  # 설치 또는 업그레이드
  if helm status gitlab-runner -n "$CICD_NS" >/dev/null 2>&1; then
    log "기존 릴리즈 발견 — 업그레이드 실행..."
    helm upgrade gitlab-runner gitlab/gitlab-runner \
      -n "$CICD_NS" \
      -f "$RUNNER_VALUES" \
      --set "runnerToken=${token}" \
      --wait --timeout 120s
  else
    log "신규 설치 실행..."
    helm install gitlab-runner gitlab/gitlab-runner \
      -n "$CICD_NS" \
      -f "$RUNNER_VALUES" \
      --set "runnerToken=${token}" \
      --wait --timeout 120s
  fi

  # 결과 확인
  log "Runner Pod 상태:"
  kubectl get pods -n "$CICD_NS" -l app=gitlab-runner

  log ""
  info "설치 완료. GitLab 웹 UI에서 Runner 등록 확인:"
  info "  GitLab 프로젝트 → Settings → CI/CD → Runners"
}

# ---------------------------------------------------------------------------
# Task: status — 전체 상태 확인
# ---------------------------------------------------------------------------
show_status() {
  log "=== GitLab 환경 상태 확인 ==="

  # glab 설치 여부
  info "-- glab CLI --"
  if command -v glab >/dev/null 2>&1; then
    glab --version 2>/dev/null | head -1
    echo "  위치: $(which glab)"
  else
    echo "  [미설치] ./scripts/gitlab-setup.sh install-glab 실행 필요"
  fi

  # glab 인증 상태
  info ""
  info "-- GitLab 인증 --"
  if command -v glab >/dev/null 2>&1; then
    glab auth status 2>&1 | head -5 || echo "  [미인증]"
  else
    echo "  [glab 미설치]"
  fi

  # K8s cicd 네임스페이스
  info ""
  info "-- K8s cicd 네임스페이스 --"
  if command -v kubectl >/dev/null 2>&1; then
    kubectl get pods -n "$CICD_NS" 2>/dev/null \
      || echo "  (cicd 네임스페이스 없음 또는 K8s 미연결)"
  else
    echo "  [kubectl 미설치]"
  fi

  # Helm 릴리스
  info ""
  info "-- Helm 릴리스 (cicd namespace) --"
  if command -v helm >/dev/null 2>&1; then
    helm list -n "$CICD_NS" 2>/dev/null || echo "  (helm 연결 불가)"
  else
    echo "  [helm 미설치]"
  fi

  # Runner values 파일 존재 여부
  info ""
  info "-- GitLab Runner values.yaml --"
  if [[ -f "$RUNNER_VALUES" ]]; then
    echo "  [OK] $RUNNER_VALUES"
    grep -E '^gitlabUrl:|^concurrent:|nameOverride:' "$RUNNER_VALUES" 2>/dev/null \
      | sed 's/^/    /'
  else
    echo "  [없음] $RUNNER_VALUES"
  fi
}

# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
ACTION="${1:-help}"

case "$ACTION" in
  install-glab)
    install_glab
    ;;
  auth)
    auth_gitlab
    ;;
  create-project)
    create_project
    ;;
  set-vars)
    set_vars
    ;;
  runner-dryrun|dry-run)
    runner_dryrun
    ;;
  install-runner|runner-install)
    install_runner
    ;;
  status)
    show_status
    ;;
  help|*)
    echo "사용법: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  install-glab    glab CLI 설치 (~/.local/bin, sudo 불필요)"
    echo "  auth            GitLab 인증 (glab auth login)"
    echo "  create-project  GitLab 프로젝트 생성 + GitHub remote 추가"
    echo "  set-vars        CI/CD Variables 등록 (SONAR_HOST_URL, SONAR_TOKEN, GITOPS_TOKEN)"
    echo "  runner-dryrun   GitLab Runner Helm dry-run 검증"
    echo "  install-runner  GitLab Runner Helm 실제 설치 (K8s Executor)"
    echo "  status          설치 상태 전체 확인"
    echo ""
    echo "환경변수로 토큰 전달 (대화형 입력 생략):"
    echo "  RUNNER_TOKEN=glrt-xxx ./scripts/gitlab-setup.sh install-runner"
    echo "  SONAR_TOKEN=squ-xxx GITOPS_TOKEN=ghp-xxx ./scripts/gitlab-setup.sh set-vars"
    echo ""
    echo "권장 실행 순서:"
    echo "  1. ./scripts/gitlab-setup.sh install-glab"
    echo "  2. ./scripts/gitlab-setup.sh auth"
    echo "  3. ./scripts/gitlab-setup.sh create-project"
    echo "  4. ./scripts/gitlab-setup.sh set-vars"
    echo "  5. ./scripts/gitlab-setup.sh runner-dryrun    # 검증 먼저"
    echo "  6. RUNNER_TOKEN=glrt-xxx ./scripts/gitlab-setup.sh install-runner"
    ;;
esac
