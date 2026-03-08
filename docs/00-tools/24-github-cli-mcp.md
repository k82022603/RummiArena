# 24. GitHub CLI + GitHub MCP 설정 매뉴얼

## 1. 개요

이 프로젝트에서 GitHub을 두 가지 방식으로 사용한다:

| 용도 | 도구 | 설명 |
|------|------|------|
| Git 인증 + Push/PR | GitHub CLI (`gh`) | 터미널에서 GitHub 작업 |
| Claude Code 연동 | GitHub MCP Server | Claude Code가 이슈/PR 관리 |

두 가지 모두 **GitHub PAT (Personal Access Token)**이 필요하다.

## 2. PAT (Personal Access Token) 생성

### 2.1 Fine-grained PAT 생성 (권장)

1. https://github.com/settings/tokens?type=beta 접속
2. **"Generate new token"** 클릭
3. 설정:

| 항목 | 값 |
|------|-----|
| Token name | `RummiArena-CLI` |
| Expiration | 90 days (권장) |
| Resource owner | 본인 계정 |
| Repository access | **Only select repositories** → `k82022603/RummiArena` |

4. **Permissions** (Repository permissions):

| Permission | Level | 용도 |
|-----------|-------|------|
| Contents | Read and write | git push, 파일 읽기/쓰기 |
| Issues | Read and write | 이슈 생성/수정 |
| Pull requests | Read and write | PR 생성/수정 |
| Metadata | Read-only | 자동 설정 |

5. **"Generate token"** 클릭
6. `github_pat_...` 형식의 토큰 복사 (이 화면을 벗어나면 다시 볼 수 없음)

### 2.2 Classic PAT (대안)

Fine-grained가 안 되는 경우:
1. https://github.com/settings/tokens 접속
2. **"Generate new token (classic)"** 클릭
3. Scopes: `repo`, `read:org`, `project` 체크
4. 토큰 복사

## 3. GitHub CLI (`gh`) 설치 및 인증

### 3.1 설치 (sudo 없이)

```bash
# 최신 버전 다운로드 및 설치
GH_VERSION=$(curl -sL https://api.github.com/repos/cli/cli/releases/latest \
  | grep '"tag_name"' | head -1 | sed 's/.*"v\(.*\)".*/\1/')

curl -sL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
  -o /tmp/gh.tar.gz

cd /tmp && tar xzf gh.tar.gz
mkdir -p ~/.local/bin
cp gh_*/bin/gh ~/.local/bin/
chmod +x ~/.local/bin/gh

# PATH 추가 (영구)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# 확인
gh --version
```

### 3.2 sudo 있는 경우

```bash
sudo apt install -y gh
```

### 3.3 인증

```bash
# 토큰으로 로그인
echo "github_pat_토큰값" | gh auth login --with-token

# 인증 확인
gh auth status
```

## 4. GitHub MCP 서버 설정

### 4.1 환경변수 설정

```bash
# ~/.bashrc에 추가 (영구)
echo 'export GITHUB_TOKEN="github_pat_토큰값"' >> ~/.bashrc
source ~/.bashrc
```

### 4.2 .mcp.json 설정

프로젝트 루트의 `.mcp.json`에 이미 설정되어 있다:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

> **참고**: `${GITHUB_TOKEN}`은 시스템 환경변수를 참조한다.
> `.bashrc`에 `export GITHUB_TOKEN=...` 설정 필수.

### 4.3 MCP 동작 확인

Claude Code 재시작 후:
```
/mcp
```
→ `github` 서버가 `running` 상태인지 확인

### 4.4 사용 가능한 MCP 기능

| 기능 | 설명 |
|------|------|
| 이슈 생성/조회/수정 | `create_issue`, `get_issue`, `list_issues` |
| PR 생성/조회/리뷰 | `create_pull_request`, `get_pull_request` |
| 파일 내용 조회 | `get_file_contents` |
| 브랜치 관리 | `create_branch`, `list_branches` |
| 커밋 이력 | `list_commits` |
| 레포지토리 검색 | `search_repositories`, `search_code` |

## 5. Git Push 워크플로우

### 5.1 첫 Push

```bash
# 인증 확인
gh auth status

# Push (main 브랜치)
git push -u origin main
```

### 5.2 이후 Push

```bash
git push
```

### 5.3 gh로 PR 생성

```bash
gh pr create --title "제목" --body "설명"
```

## 6. 트러블슈팅

### `sudo` 없이 gh 설치 실패
→ 3.1의 바이너리 직접 설치 방법 사용

### `git push` 시 Username 물어봄
→ `gh auth login`이 안 된 상태. 토큰으로 재인증

### MCP github 서버 연결 실패
→ `GITHUB_TOKEN` 환경변수 확인: `echo $GITHUB_TOKEN`
→ Claude Code 재시작 필요 (환경변수 변경 후)

### PAT 만료
→ https://github.com/settings/tokens 에서 재생성
→ `gh auth login --with-token`으로 재인증
→ `.bashrc`의 `GITHUB_TOKEN` 값 갱신

## 7. 보안 주의사항

- PAT를 코드에 직접 하드코딩하지 않는다
- `.env` 파일에 넣을 경우 반드시 `.gitignore`에 추가
- `${GITHUB_TOKEN}` 환경변수 참조 방식 사용 (`.mcp.json`)
- 토큰 권한은 필요한 최소 범위만 부여 (Fine-grained PAT 권장)
- 만료 기한 설정 필수 (90일 권장)

## 8. 참고 링크

- [GitHub CLI 공식 문서](https://cli.github.com/manual/)
- [Fine-grained PAT 가이드](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/github)
- hybrid-rag 프로젝트 참조: `hybrid-rag-knowledge-ops/.mcp.json`
