# 잔여 작업 로드맵 & 백로그

> **최종 업데이트**: 2026-03-21
> **현재 위치**: Sprint 1 마감 임박 (2026-03-28) → Sprint 2 대기 (2026-03-29~04-11)

---

## 현재 상태 요약

```mermaid
flowchart LR
    S0["Sprint 0\n기획 & 환경\n✅ 완료"]
    S1["Sprint 1\nCI/CD & DevSecOps\n🔶 마감 D-7"]
    S2["Sprint 2\nAI 캐릭터 & E2E\n⏳ 2026-03-29"]
    S3["Sprint 3\n프론트엔드 완성\n⏳ 2026-04-12"]
    S4["Sprint 4 이후\nAI Adapter ~ Mesh\n⏳ 미착수"]

    S0 -->|완료| S1
    S1 -->|D-7| S2
    S2 --> S3
    S3 --> S4
```

| 항목 | 상태 |
|------|------|
| Sprint 0 (기획/환경) | ✅ 완료 |
| GitLab CI 파이프라인 lint/test GREEN | ✅ 완료 |
| SonarQube Quality Gate 3개 프로젝트 | ✅ 완료 |
| GitLab Runner K8s 등록 | ✅ 완료 |
| quality/build/update-gitops 단계 GREEN | 🔶 진행 중 |
| ArgoCD Application 등록 | ❌ 미착수 |
| Sprint 2 개발 (#20~#23) | ❌ 2026-03-29 시작 예정 |

---

## Sprint 1 잔여 작업 (마감 2026-03-28)

### P1 - 필수

| # | 작업 | 담당 | 비고 |
|---|------|------|------|
| 1 | quality 단계 GREEN (sonarqube + trivy-fs) | DevOps | SonarQube UP 필요 |
| 2 | build 단계 GREEN (3개 서비스 Docker 빌드) | DevOps | DOCKER_IMAGE 소문자 확인 |
| 3 | update-gitops 단계 GREEN | DevOps | dev-values.yaml 커밋 |
| 4 | Sprint 1 공식 회고 + 마감 | PM | 2026-03-28 이전 |

### P2 - 권장

| # | 작업 | 담당 | 비고 |
|---|------|------|------|
| 5 | ArgoCD Application 등록 | DevOps | 현재 수동 Helm 배포만 |
| 6 | ai-adapter SonarQube lcov 재스캔 | QA | coverage/lcov.info → 31.82% |
| 7 | k8s 서비스 상태 점검 | DevOps | 리부팅 후 파드 상태 확인 |

---

## Sprint 2 백로그 (2026-03-29 ~ 04-11, 30 SP)

```mermaid
flowchart TB
    subgraph S2["Sprint 2 작업"]
        direction LR
        I20["#20 AI 캐릭터 시스템\n(P0-critical, 10 SP)"]
        I21["#21 E2E 테스트\n(P1-high, 5 SP)"]
        I22["#22 관리자 대시보드\n(P1-high, 8 SP)"]
        I23["#23 연습 모드 Stage 1~3\n(P1-high, 7 SP)"]
    end

    I20 --> I21
```

### [#20] AI 캐릭터 시스템 구현 (P0-critical, 10 SP)

- **서비스**: ai-adapter (NestJS)
- **핵심 산출물**:
  - 6개 캐릭터 × 3 난이도 × 심리전 Level 0~3 프롬프트 빌더
  - CharacterService, DifficultyModifier, PsychWarfareModule
  - 캐릭터별 전략 프롬프트 템플릿 (JSON)
- **캐릭터 목록**: Rookie, Calculator, Shark, Fox, Wall, Wildcard
- **난이도**: 하수 / 중수 / 고수
- **심리전 레벨**: 0(없음) ~ 3(최고)

### [#21] 게임 흐름 E2E 테스트 (P1-high, 5 SP)

- **서비스**: game-server (Go)
- **핵심 산출물**:
  - Go httptest 기반 E2E 시나리오 자동화
  - 게스트 로그인 → 방 생성 → 참가 → 게임 시작 → 턴 진행 → 종료
  - CI 파이프라인 통합 (test 단계)
- **현재 상태**: dev-login API 동작 확인, 방 생성/참가 API 확인됨

### [#22] 관리자 대시보드 기본 기능 (P1-high, 8 SP)

- **서비스**: src/admin/ (Next.js, 현재 디렉토리 없음)
- **핵심 산출물**:
  - Next.js 프로젝트 초기화
  - 활성 게임 목록 / 방 상세 뷰
  - 유저 목록 (닉네임, 게임 이력)
  - AI 모델별 승률 통계 차트
  - Dockerfile + Helm Chart 기본 구조

### [#23] 1인 연습 모드 Stage 1~3 (P1-high, 7 SP)

- **서비스**: frontend (Next.js)
- **현재 상태**: 게임 보드 UI + DnD 존재, 연습 모드 로직 미구현
- **핵심 산출물**:
  - Stage 1: 그룹 만들기 (색상 그룹 배치 튜토리얼)
  - Stage 2: 런 만들기 (숫자 연속 배치 튜토리얼)
  - Stage 3: 조커 활용 (조커 규칙 실습)
  - 스코어/진행도 표시, 힌트 시스템
  - 게임 엔진 API 연동 (유효성 검증)

---

## Sprint 3+ 로드맵 (참고)

| Sprint | 기간 | 목표 | 핵심 작업 |
|--------|------|------|-----------|
| Sprint 3 | 04-12 ~ 04-25 | 프론트엔드 완성 | Google OAuth, 게임 보드 완성, WebSocket 연동 |
| Sprint 4 | 04-26 ~ 05-09 | AI Adapter 4종 | OpenAI/Claude/DeepSeek/Ollama 연동 |
| Sprint 5 | 05-10 ~ 05-23 | 멀티플레이 완성 | Human+AI 혼합, 턴 동기화, 재연결 처리 |
| Sprint 6 | 05-24 ~ 06-06 | 플랫폼 확장 | ELO 랭킹, 카카오톡 알림, 관리자 고도화 |
| Sprint 7 | 06-07 ~ 06-20 | Observability | Prometheus, Grafana, Loki |
| Sprint 8 | 06-21 ~ 07-04 | 보안 고도화 | OWASP ZAP, Sealed Secrets, Cert-Manager |
| Sprint 9 | 07-05 ~ 07-18 | Service Mesh | Istio, Kiali, Jaeger, k6 부하 테스트 |
| 운영 | 07-19 ~ 08-01 | AI 토너먼트 | 100판 실험, 모델 비교 분석 |

---

## Istio가 Sprint 9 (맨 마지막)인 이유

> **Q**: "Istio Service Mesh 작업이 왜 제일 뒤야?"

짧게 말하면: **Istio는 선행 기술 의존성이 제일 많은 overlay 기술이기 때문이다.**

### 기술 의존성 체인

```mermaid
flowchart LR
    SVC["서비스 완성\n(Sprint 5)"]
    PROM["Prometheus/Grafana\n(Sprint 7)"]
    SEC["보안 기반\nCert-Manager/Vault\n(Sprint 8)"]
    ISTIO["Istio + Kiali + Jaeger\n(Sprint 9)"]

    SVC -->|"안정 서비스 없으면\n사이드카 디버깅 지옥"| ISTIO
    PROM -->|"Istio 메트릭은\nPrometheus로 수집"| ISTIO
    SEC -->|"mTLS 인증서\nCert-Manager 연동"| ISTIO
```

### 상세 이유 5가지

**1. Prometheus가 먼저 있어야 한다 (Sprint 7 선행)**

Istio의 Envoy sidecar는 메트릭을 Prometheus에 밀어 넣는다. Kiali(서비스 토폴로지)와 Jaeger(분산 트레이싱)도 Prometheus 데이터를 기반으로 동작한다. Sprint 7에서 Prometheus/Grafana 스택을 먼저 구축하지 않으면 Istio를 설치해도 시각화가 안 된다.

**2. 서비스가 모두 안정화된 후 도입해야 한다 (Sprint 5~6 선행)**

Istio는 `istio-injection=enabled` 레이블 하나로 모든 Pod에 Envoy sidecar를 자동 주입한다. 서비스가 완성되지 않은 상태에서 Mesh를 씌우면, 애플리케이션 버그인지 Mesh 이슈인지 구분이 안 된다. "완성된 서비스에 인프라를 더한다"는 순서가 맞다.

**3. 보안 기반이 필요하다 (Sprint 8 선행)**

Istio의 핵심 기능은 mTLS(상호 TLS)이다. Cert-Manager가 없으면 인증서 관리가 수동이 되고, Vault(Sealed Secrets)가 없으면 Istio 설정 secret이 평문으로 들어간다. Sprint 8에서 PKI 기반을 먼저 닦고 Istio를 올리는 것이 보안 설계상 맞다.

**4. Traefik이 이미 North-South를 담당하고 있다**

Traefik Ingress Controller가 Phase 1부터 사용 중이다 (NGINX Ingress EOL 이슈로 선택). Istio는 East-West(서비스 간) 트래픽 메쉬 용도로만 추가하는 overlay다. 이 역할 분리가 명확해야 Istio 도입 시 트래픽 정책 충돌을 피할 수 있다. 역할이 확정되는 시점은 서비스 아키텍처가 안정된 Sprint 5~6 이후다.

**5. 운영 복잡도 vs 학습 곡선 관리**

Istio는 CRD(VirtualService, DestinationRule, PeerAuthentication 등)가 50개 이상이고 Envoy config dump 디버깅이 익숙해지는 데 시간이 필요하다. 이 복잡도를 감당할 여유는 핵심 기능이 완성된 이후다. 특히 이 프로젝트는 **AI 전략 실험이 목적**이므로, 게임 기능(Sprint 1~6)을 먼저 완성하고 Mesh는 마지막에 얹는 것이 우선순위 관점에서도 올바르다.

### 요약

| 의존성 | 없으면 어떻게 되는가? |
|--------|----------------------|
| 서비스 완성 (Sprint 5) | 사이드카 주입 후 버그 추적 불가 |
| Prometheus (Sprint 7) | Kiali/Jaeger 동작 안 함, 메트릭 없음 |
| Cert-Manager (Sprint 8) | mTLS 인증서 수동 관리, 보안 취약 |
| Traefik 역할 확정 | North-South/East-West 트래픽 정책 충돌 |

**결론**: Istio는 "기반이 쌓인 위에 얹는 마지막 계층"이다. 선행 의존이 제일 많기 때문에 Sprint 9가 맞다.

---

## 개발(코딩) 완료 현황

> "개발은 모두 끝난 것인가?"에 대한 답변

### 현재까지 완성된 코드

| 서비스 | 완성도 | 비고 |
|--------|--------|------|
| game-server (Go) | ~60% | 게임 엔진 + REST API + WebSocket 기본 구현 |
| ai-adapter (NestJS) | ~40% | 공통 인터페이스 + 테스트 110개 (실제 LLM 호출 미구현) |
| frontend (Next.js) | ~35% | 게임 보드 UI + DnD + 게스트 로그인 |
| admin (Next.js) | 0% | 디렉토리도 없음 |

### 남은 개발 작업 (Sprint 2~6)

| Sprint | 개발 볼륨 | 주요 코딩 |
|--------|----------|----------|
| Sprint 2 | ★★★★ 큼 | AI 캐릭터 시스템, E2E 테스트, 관리자 UI, 연습 모드 |
| Sprint 3 | ★★★★ 큼 | Google OAuth, WebSocket 완성, 게임 보드 완성 |
| Sprint 4 | ★★★★ 큼 | 4개 LLM Adapter 구현 |
| Sprint 5 | ★★★ 중간 | 멀티플레이 통합, 턴 동기화 |
| Sprint 6 | ★★★ 중간 | ELO 랭킹, 카카오톡, 관리자 고도화 |

**결론: 개발은 아직 40~50%도 안 끝났다.** Sprint 0~1은 인프라/환경/CI 구축 위주였고, 진짜 게임 로직/AI/프론트엔드는 Sprint 2부터 본격 시작이다.

---

*이 문서는 Sprint 진행에 따라 지속 업데이트된다.*
