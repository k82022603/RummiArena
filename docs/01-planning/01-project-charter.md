# 프로젝트 헌장 (Project Charter)

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 프로젝트명 | RummiArena - 멀티 LLM 전략 실험 플랫폼 |
| 프로젝트 유형 | 내부 AI 실험 프로젝트 (외부 서비스 수준 설계) |
| 시작일 | 2026-03-08 |
| 목표 종료일 | 2026-08-15 (약 23주, Sprint 0~9) |
| Sprint 주기 | 2주 |
| 저장소 | https://github.com/k82022603/RummiArena |

## 2. 프로젝트 목적

루미큐브(Rummikub) 보드게임을 기반으로 Human과 AI가 혼합 대전하는 플랫폼을 구축한다.

### 핵심 목표
- **멀티 LLM 전략 비교**: OpenAI, Claude, DeepSeek, 로컬 LLaMA 모델의 게임 전략을 실험/비교
- **풀스택 플랫폼 엔지니어링 실습**: Kubernetes, GitOps, DevSecOps 전체 사이클 경험
- **실시간 멀티플레이**: WebSocket 기반 2~4인 동시 대전
- **외부 공개 가능한 아키텍처**: 내부 실험이지만 SaaS 수준 설계

## 3. 프로젝트 범위 (Scope)

### In-Scope
- 루미큐브 게임 엔진 (규칙 검증, 상태 관리)
- 1인 연습 모드 (Stage 1~6, 튜토리얼 포함)
- 실시간 멀티플레이 (WebSocket)
- Google OAuth 로그인
- 멀티 LLM AI 플레이어 (OpenAI, Claude, DeepSeek, Ollama/LLaMA)
- AI 캐릭터 시스템 (6캐릭터 x 3난이도 x 심리전 Level 0~3)
- ELO 랭킹 시스템
- 관리자 대시보드 (게임 모니터링, AI 통계, 유저 관리)
- Kubernetes 배포 (Docker Desktop)
- GitOps CI/CD (GitLab + GitLab Runner + ArgoCD + Helm)
- DevSecOps (SonarQube, Trivy, OWASP ZAP)
- 카카오톡 알림 연동
- Observability (Lean -> 점진 확장)

### Out-of-Scope
- 모바일 네이티브 앱
- 결제 시스템
- 대규모 트래픽 처리 (100+ 동시 사용자)

## 4. 이해관계자

| 역할 | 담당 | 비고 |
|------|------|------|
| PM / 개발자 | 애벌레 | 전체 설계/개발/운영 (1인 개발) |
| AI 플레이어 | LLM 모델들 | OpenAI, Claude, DeepSeek, LLaMA |
| 사용자 | 내부 테스터 | Google 계정 보유자 |

## 5. 마일스톤

```mermaid
gantt
    title RummiArena 마일스톤
    dateFormat YYYY-MM-DD
    axisFormat %m/%d

    section Phase 1
        Sprint 0 - 기획 & 환경 구축     :done, s0, 2026-03-08, 2026-03-28
    section Phase 2
        Sprint 1 - 게임 엔진             :s1, 2026-03-29, 2026-04-11
        Sprint 2 - 백엔드 API            :s2, 2026-04-12, 2026-04-25
        Sprint 3 - 프론트엔드 + 연습모드  :s3, 2026-04-26, 2026-05-09
    section Phase 3
        Sprint 4 - AI Adapter            :s4, 2026-05-10, 2026-05-23
        Sprint 5 - 멀티플레이 완성        :s5, 2026-05-24, 2026-06-06
    section Phase 4
        Sprint 6 - 관리자 & 통계          :s6, 2026-06-07, 2026-06-20
    section Phase 5
        Sprint 7 - Observability          :s7, 2026-06-21, 2026-07-04
        Sprint 8 - 보안 고도화            :s8, 2026-07-05, 2026-07-18
        Sprint 9 - Service Mesh           :s9, 2026-07-19, 2026-08-01
    section Phase 6
        운영 & 실험                       :op, 2026-08-02, 2026-08-15
```

| Phase | 목표 날짜 | 마일스톤 |
|-------|-----------|----------|
| Phase 1 (Sprint 0) | 2026-03-28 | 기획 완료, 인프라 환경 구축, **Backend 기술 결정** |
| Phase 2 (Sprint 1~3) | 2026-05-09 | 게임 엔진 + 백엔드 + 프론트엔드 MVP, 1인 연습 모드 |
| Phase 3 (Sprint 4~5) | 2026-06-06 | AI Adapter 4종 연동, 실시간 멀티플레이 |
| Phase 4 (Sprint 6) | 2026-06-20 | 관리자 대시보드, ELO 랭킹, 카카오톡 알림 |
| Phase 5 (Sprint 7~9) | 2026-08-01 | Observability, 보안 고도화, Istio Service Mesh |
| Phase 6 (운영) | 2026-08-15 | AI 토너먼트, 모델 비교 분석, 운영 가이드 |

> Backend 기술 결정 (NestJS vs Go): Sprint 0 완료 전(2026-03 말)까지 확정한다.

## 6. 핵심 제약 조건

### 6.1 하드웨어 사양
| 항목 | 사양 |
|------|------|
| 장비 | LG 그램 15Z90R |
| CPU | Intel i7-1360P (12코어/16스레드, 2.2GHz) |
| RAM | 16GB (실사용 가능 ~12GB, OS/시스템 제외) |
| GPU | Intel Iris Xe (내장, VRAM 없음) |
| 디스크 | SSD |
| OS | Windows 11 Pro + WSL2 + Hyper-V |

### 6.2 리소스 제약 및 운영 전략
RAM 16GB로 모든 서비스 동시 실행 불가. **교대 실행 전략** 적용:

| 모드 | 실행 서비스 | 예상 RAM |
|------|------------|----------|
| 개발 모드 | 앱(게임서버, 프론트) + Redis + PostgreSQL | ~6GB |
| CI/CD 모드 | ArgoCD + GitLab Runner | ~6GB |
| 품질 모드 | SonarQube (단독) | ~4GB |
| AI 실험 모드 | Ollama + 1B~3B 모델 (K8s 밖 직접 실행) | ~5GB |

> Oracle VirtualBox 별도 VM은 이 사양에서 RAM 분할만 발생하므로 사용하지 않는다.
> Ollama로 7B+ 모델은 K8s와 동시 실행 불가. 3B 이하 모델 또는 API 모델 사용 권장.

### 6.3 기타 제약
| 제약 | 상세 |
|------|------|
| 비용 | LLM API 호출 비용 최소화 필요 |
| 인원 | 1인 개발 |

## 7. 기술 스택 요약

| 영역 | 기술 |
|------|------|
| Frontend | Next.js, TailwindCSS, Framer Motion, dnd-kit |
| Backend | Node.js (NestJS) 또는 Go (gin) -- Sprint 0 내 결정 |
| Database | PostgreSQL 16 |
| Cache/State | Redis 7 |
| AI | OpenAI API, Claude API, DeepSeek API, Ollama |
| Container | Docker, Kubernetes (Docker Desktop) |
| CI | GitLab CI + GitLab Runner |
| CD | ArgoCD + Helm |
| Code Quality | SonarQube |
| Security | Trivy, OWASP ZAP |
| Notification | 카카오톡 API |
| Auth | Google OAuth 2.0 |

## 8. 성공 기준

### 8.1 기능 성공 기준
| 기준 | 목표값 |
|------|--------|
| Human + AI 혼합 게임 정상 동작 | 2~4인 게임 완주율 95% 이상 |
| LLM 모델 동시 참가 | 최소 3개 이상 모델 동시 참가 가능 |
| AI 대전 실험 | AI vs AI 대전 100판 이상 완료 |
| 1인 연습 모드 | Stage 1~6 전체 플레이 가능 |
| AI 캐릭터 시스템 | 6캐릭터 x 3난이도 조합 동작 확인 |

### 8.2 품질/인프라 성공 기준
| 기준 | 목표값 |
|------|--------|
| CI 파이프라인 소요 시간 | 평균 5분 이내 |
| GitOps 자동 배포 | ArgoCD Sync 성공률 99% 이상 |
| SonarQube 품질 게이트 | 통과 (Coverage >= 60%, Bug 0) |
| 컨테이너 보안 스캔 | Trivy CRITICAL/HIGH 취약점 0 |
| Pod 재시작 시 게임 복구 | 30초 이내 |
| AI 턴 응답 시간 | 10초 이내 (95 percentile) |
| 게임 결과 기반 AI 비교 | 모델별 승률/전략 분석 리포트 산출 |
