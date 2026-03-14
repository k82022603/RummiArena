# GitLab CI + GitLab Runner 매뉴얼

## 1. 개요
CI 파이프라인 엔진. 코드 Push 시 자동으로 빌드·테스트·스캔·이미지 Push 수행.
ArgoCD(CD)와 분리하여 GitOps 구조를 완성한다.

> **현재 상태 (Sprint 1)**: `.gitlab-ci.yml` 생성 완료. GitLab 인스턴스 + Runner 등록은 Sprint 2 이월.

## 2. 구성 전략

### 소스 ↔ GitOps 레포 분리
```
GitHub (k82022603/RummiArena)  ← 소스 코드
GitLab (미러 또는 CI 전용)      ← .gitlab-ci.yml, Runner 실행
GitOps Repo                    ← Helm values (image tag)
```

### 대안: GitHub Actions로 전환도 가능
소스가 GitHub에 있으므로 GitHub Actions도 옵션.
GitLab CI 학습 목적이라면 GitLab 미러링 또는 GitLab CI 전용 레포 구성.

## 3. GitLab Runner 설치

### 3.1 Docker Executor (권장, Phase 1)
```bash
# WSL2 또는 Windows에서
docker run -d --name gitlab-runner --restart always \
  -v /srv/gitlab-runner/config:/etc/gitlab-runner \
  -v /var/run/docker.sock:/var/run/docker.sock \
  gitlab/gitlab-runner:latest
```

### 3.2 Runner 등록
```bash
docker exec -it gitlab-runner gitlab-runner register \
  --url https://gitlab.com/ \
  --registration-token <TOKEN> \
  --executor docker \
  --docker-image docker:latest \
  --description "rummikub-runner" \
  --tag-list "rummikub,docker" \
  --docker-privileged
```

## 4. .gitlab-ci.yml 기본 구조

```yaml
stages:
  - test
  - scan
  - build
  - update-gitops

variables:
  DOCKER_IMAGE: registry.gitlab.com/$CI_PROJECT_PATH

# 테스트
test:
  stage: test
  image: node:20
  script:
    - cd src/game-server
    - npm ci
    - npm test
  only:
    - main
    - develop

# SonarQube 스캔
sonarqube:
  stage: scan
  image: sonarsource/sonar-scanner-cli
  script:
    - sonar-scanner
      -Dsonar.projectKey=rummikub
      -Dsonar.host.url=$SONAR_HOST_URL
      -Dsonar.token=$SONAR_TOKEN

# Docker 빌드 + Push
build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t $DOCKER_IMAGE/game-server:$CI_COMMIT_SHA src/game-server/
    - docker push $DOCKER_IMAGE/game-server:$CI_COMMIT_SHA

# GitOps 레포 image tag 업데이트
update-gitops:
  stage: update-gitops
  image: alpine/git
  script:
    - git clone https://$GITOPS_TOKEN@gitlab.com/xxx/rummikub-gitops.git
    - cd rummikub-gitops
    - "sed -i 's|tag:.*|tag: \"$CI_COMMIT_SHA\"|' helm/values.yaml"
    - git add . && git commit -m "update image tag to $CI_COMMIT_SHA"
    - git push
```

## 5. 환경 변수 (GitLab Settings > CI/CD > Variables)

| 변수 | 용도 |
|------|------|
| `SONAR_HOST_URL` | SonarQube 서버 URL |
| `SONAR_TOKEN` | SonarQube 인증 토큰 |
| `GITOPS_TOKEN` | GitOps 레포 Push 토큰 |
| `DOCKER_AUTH_CONFIG` | Registry 인증 |

## 6. 트러블슈팅

| 문제 | 해결 |
|------|------|
| Runner offline | `docker logs gitlab-runner` 확인 |
| Docker build 실패 | `--docker-privileged` 설정 확인 |
| Push 권한 에러 | GitLab Container Registry 활성화 확인 |
| CI 느림 | 캐시 설정 (`cache:` 키워드) |

## 7. 참고 링크
- GitLab CI 문서: https://docs.gitlab.com/ee/ci/
- Runner 설치: https://docs.gitlab.com/runner/install/
