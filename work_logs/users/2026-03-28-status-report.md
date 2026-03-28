# RummiArena 인프라 상태 보고서

- **작성일**: 2026-03-28
- **기준**: 2026-03-23 Sprint 4 완료 이후 발생 장애 정리

---

## 1. K8s 파드 상태 (2026-03-28 실시간)

| 서비스 | 상태 | 비고 |
|--------|------|------|
| postgres | ✅ Running | 2026-03-26 수동 secret 재생성으로 복구 |
| redis | ✅ Running | 정상 |
| ai-adapter | ✅ Running | 정상 |
| ollama | ✅ Running | 정상 |
| admin | ❌ ErrImageNeverPull | K8s 참조 이미지명 불일치 |
| frontend | ❌ ErrImageNeverPull | K8s 참조 이미지명 불일치 |
| game-server | ❌ CrashLoopBackOff | 102회 재시작, 원인 분석 필요 |

---

## 2. 장애 타임라인

### 2026-03-26

| 시간 | 이벤트 |
|------|--------|
| ~10:00 | K8s 전체 점검 — postgres CrashLoopBackOff, admin/frontend ErrImageNeverPull, game-server Init:0/2 |
| ~15:20 | ArgoCD 비밀번호 초기화 (`argocd-initial-admin-secret` 삭제됨) → bcrypt 재생성 후 복구 |
| ~17:15 | PostgreSQL 원인 확인: `POSTGRES_PASSWORD` 빈 문자열 → 수동 secret 재생성 + PVC 삭제 → Running |
| ~17:50 | GitLab remote 히스토리 불일치 확인 → GitLab remote 제거, GitHub only로 정리 |

### 2026-03-27

| 시간 | 이벤트 |
|------|--------|
| ~13:00 | GitLab CI golangci-lint 실패 확인 (S1039/S1024/S1016) → 빌드 차단 |
| ~17:00 | 종합 트러블슈팅 가이드 작성 |

---

## 3. 미해결 이슈

### ISS-K8S-001: game-server CrashLoopBackOff
- **증상**: 102회 재시작, postgres Running 이후에도 지속
- **추정 원인**: 환경변수 누락, DB 연결 실패, 또는 코드 패닉
- **조치**: 로그 확인 후 수정 필요

### ISS-K8S-002: admin/frontend ErrImageNeverPull
- **증상**: 로컬에 `rummiarena/admin:dev` 이미지 존재하나 K8s가 Pull 실패
- **추정 원인**: ArgoCD Sync로 Helm values와 다른 이미지명(GitLab Registry 주소)으로 배포됐을 가능성
- **조치**: Deployment 이미지명 확인 → 재빌드/재배포

### ISS-CI-001: GitLab CI golangci-lint 실패
- **증상**: `golangci-lint run ./... --timeout 5m` 실패
- **에러**:
  - S1039: `fmt.Sprintf` 불필요 사용
  - S1024: `time.Sub(time.Now())` → `time.Until()` 권장
  - S1016: struct literal → type conversion 권장
- **조치**: 코드 수정 후 push → CI 재실행

---

## 4. 해결된 이슈

| 이슈 | 해결일 | 방법 |
|------|--------|------|
| PostgreSQL CrashLoopBackOff | 2026-03-26 | 수동 secret 재생성, PVC 삭제 |
| ArgoCD 비밀번호 분실 | 2026-03-26 | bcrypt 재생성 후 K8s secret patch |
| GitLab remote 히스토리 불일치 | 2026-03-26 | GitLab remote 제거, GitHub only |

---

## 5. 구조적 개선 사항 (권고)

1. **PostgreSQL secret 관리**: `kubectl create secret` 수동 방식 → Helm `--set credentials.password=` 또는 SealedSecrets 도입 검토
2. **ArgoCD ignoreDifferences**: `postgres-secret` 드리프트 무시 설정 추가
3. **imagePullPolicy**: 로컬 개발(Never) vs CI/CD(Always) values 파일 분리 (`values-dev.yaml` / `values-prod.yaml`)
