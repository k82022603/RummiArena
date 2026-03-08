# 도구 매뉴얼 인덱스 (Tools & Harness Manual)

프로젝트에서 사용하는 모든 도구의 설치·설정·사용법을 정리한다.

## 도구 분류

### 인프라 & 컨테이너
| # | 도구 | 용도 | 도입 시점 | 문서 |
|---|------|------|-----------|------|
| 01 | Docker Desktop | 컨테이너 런타임 + K8s | Phase 1 | [01-docker-desktop.md](01-docker-desktop.md) |
| 02 | Kubernetes (kubectl) | 오케스트레이션 | Phase 1 | [02-kubernetes.md](02-kubernetes.md) |
| 03 | Helm | 패키지 관리 | Phase 1 | [03-helm.md](03-helm.md) |
| 04 | Istio | Service Mesh | Phase 5 | [04-istio.md](04-istio.md) |

### CI/CD & GitOps
| # | 도구 | 용도 | 도입 시점 | 문서 |
|---|------|------|-----------|------|
| 05 | GitLab CI + Runner | CI 파이프라인 | Phase 1 | [05-gitlab-ci.md](05-gitlab-ci.md) |
| 06 | ArgoCD | GitOps CD | Phase 1 | [06-argocd.md](06-argocd.md) |

### 품질 & 보안 (DevSecOps)
| # | 도구 | 용도 | 도입 시점 | 문서 |
|---|------|------|-----------|------|
| 07 | SonarQube | 정적 분석, 코드 품질 | Phase 1 | [07-sonarqube.md](07-sonarqube.md) |
| 08 | Trivy | 컨테이너 이미지 보안 스캔 | Phase 5 | [08-trivy.md](08-trivy.md) |
| 09 | OWASP ZAP | 동적 보안 테스트 (DAST) | Phase 5 | [09-owasp-zap.md](09-owasp-zap.md) |
| 10 | k6 | 부하 테스트 | Phase 5 | [10-k6.md](10-k6.md) |

### 관측 & 모니터링
| # | 도구 | 용도 | 도입 시점 | 문서 |
|---|------|------|-----------|------|
| 11 | Prometheus | 메트릭 수집 | Phase 5 | [11-prometheus.md](11-prometheus.md) |
| 12 | Grafana | 대시보드, 시각화 | Phase 5 | [12-grafana.md](12-grafana.md) |
| 13 | Kiali | Istio 서비스 토폴로지 | Phase 5 | [13-kiali.md](13-kiali.md) |
| 14 | Jaeger | 분산 트레이싱 | Phase 5 | [14-jaeger.md](14-jaeger.md) |

### AI & LLM
| # | 도구 | 용도 | 도입 시점 | 문서 |
|---|------|------|-----------|------|
| 15 | Ollama | 로컬 LLM 서빙 | Phase 3 | [15-ollama.md](15-ollama.md) |
| 16 | LangChain / LangGraph | LLM 오케스트레이션 (검토 중) | Phase 3 | [16-langchain.md](16-langchain.md) |

### 외부 API & 연동
| # | 도구 | 용도 | 도입 시점 | 문서 |
|---|------|------|-----------|------|
| 17 | Google OAuth 2.0 | 사용자 인증 | Phase 2 | [17-google-oauth.md](17-google-oauth.md) |
| 18 | 카카오톡 API | 알림 메시지 | Phase 4 | [18-kakao-api.md](18-kakao-api.md) |
| 19 | OpenAI / Claude / DeepSeek API | AI 플레이어 | Phase 3 | [19-llm-apis.md](19-llm-apis.md) |

### 프로젝트 관리 & 개발 도구
| # | 도구 | 용도 | 도입 시점 | 문서 |
|---|------|------|-----------|------|
| 20 | GitHub Projects + Issues | 백로그, 이슈 관리 | Phase 1 | [20-github-projects.md](20-github-projects.md) |
| 21 | Claude Code (Skills/MCP) | AI 개발 어시스턴트 | Phase 1 | [21-claude-code.md](21-claude-code.md) |
| 22 | Oracle VirtualBox | VM 환경 (리소스 분산) | 선택 | [22-oracle-vm.md](22-oracle-vm.md) |

## 문서 작성 규칙

각 도구 매뉴얼은 다음 구조를 따른다:

```
1. 개요 (이 프로젝트에서의 역할)
2. 설치 (Windows/WSL2/K8s 환경 기준)
3. 프로젝트 설정 (이 프로젝트 전용 설정)
4. 주요 명령어 / 사용법
5. 트러블슈팅
6. 참고 링크
```
