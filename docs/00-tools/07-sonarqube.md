# SonarQube 매뉴얼

## 1. 개요
코드 정적 분석 도구. 코드 스멜, 버그, 취약점, 커버리지를 측정.
CI 파이프라인에서 Quality Gate로 품질 기준 미달 시 빌드 실패.

## 2. 설치

### 2.1 옵션 A: Docker Compose (리소스 절약, 권장)
```yaml
# docker-compose.sonarqube.yml
services:
  sonarqube:
    image: sonarqube:community
    ports:
      - "9000:9000"
    environment:
      - SONAR_JDBC_URL=jdbc:postgresql://sonar-db:5432/sonar
      - SONAR_JDBC_USERNAME=sonar
      - SONAR_JDBC_PASSWORD=sonar
    volumes:
      - sonarqube_data:/opt/sonarqube/data
    depends_on:
      - sonar-db

  sonar-db:
    image: postgres:16
    environment:
      - POSTGRES_USER=sonar
      - POSTGRES_PASSWORD=sonar
      - POSTGRES_DB=sonar
    volumes:
      - sonar_db_data:/var/lib/postgresql/data

volumes:
  sonarqube_data:
  sonar_db_data:
```
```bash
docker compose -f docker-compose.sonarqube.yml up -d
```

### 2.2 옵션 B: Helm으로 K8s 배포
```bash
helm repo add sonarqube https://SonarSource.github.io/helm-chart-sonarqube
helm install sonarqube sonarqube/sonarqube \
  --namespace sonarqube \
  --create-namespace \
  --set resources.limits.memory=2Gi
```

### 2.3 옵션 C: Oracle VM에 설치 (리소스 분산)
- Ubuntu VM (4GB RAM, 2 CPU)
- Docker 설치 후 옵션 A 적용

### 2.4 초기 로그인
- URL: http://localhost:9000
- ID: admin / PW: admin (초기, 변경 필수)

## 3. 프로젝트 설정

### 3.1 프로젝트 생성
1. SonarQube 웹 > Create Project
2. Project Key: `rummikub`
3. Token 생성 → GitLab CI 변수에 등록

### 3.2 sonar-project.properties
```properties
sonar.projectKey=rummikub
sonar.projectName=RummiArena
sonar.sources=src/
sonar.tests=src/
sonar.test.inclusions=**/*.test.ts,**/*.spec.ts,**/*_test.go
sonar.exclusions=**/node_modules/**,**/dist/**,**/coverage/**
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.typescript.lcov.reportPaths=coverage/lcov.info
```

### 3.3 Quality Gate 설정
| 메트릭 | 기준 |
|--------|------|
| Coverage (New Code) | ≥ 60% |
| Duplicated Lines (New Code) | ≤ 5% |
| Bugs (New Code) | 0 |
| Vulnerabilities (New Code) | 0 |
| Code Smells (New Code) | ≤ 10 |
| Security Hotspots Reviewed | 100% |

## 4. CI 파이프라인 연동

### sonar-scanner 실행 (GitLab CI)
```yaml
sonarqube:
  stage: scan
  image: sonarsource/sonar-scanner-cli
  variables:
    SONAR_HOST_URL: "http://sonarqube:9000"  # 또는 외부 URL
  script:
    - sonar-scanner
      -Dsonar.projectKey=rummikub
      -Dsonar.host.url=$SONAR_HOST_URL
      -Dsonar.token=$SONAR_TOKEN
      -Dsonar.qualitygate.wait=true
```

`qualitygate.wait=true` → 게이트 실패 시 파이프라인도 실패.

## 5. 주요 화면

| 화면 | 용도 |
|------|------|
| Overview | 전체 품질 상태 |
| Issues | 코드 스멜/버그/취약점 목록 |
| Measures | 커버리지, 중복도 등 메트릭 |
| Quality Gate | 게이트 통과/실패 이력 |
| Activity | 분석 이력 |

## 6. 트러블슈팅

| 문제 | 해결 |
|------|------|
| `vm.max_map_count` 에러 | WSL2: `sudo sysctl -w vm.max_map_count=262144` |
| 메모리 부족 | `-e SONAR_SEARCH_JAVAADDITIONALOPTS=-Xmx512m` |
| Scanner 연결 실패 | `SONAR_HOST_URL` 네트워크 접근 확인 |

## 7. 참고 링크
- 공식 문서: https://docs.sonarqube.org/latest/
- Scanner CLI: https://docs.sonarqube.org/latest/analyzing-source-code/scanners/sonarscanner/
