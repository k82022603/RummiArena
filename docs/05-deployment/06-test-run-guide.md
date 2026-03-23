# 06. 빌드/배포 & 테스트 실행 가이드

> 대상: 로컬 Docker Desktop Kubernetes 환경 (WSL2)
> 최종 업데이트: 2026-03-23

---

## 1. 서비스 접속 URL

| 서비스 | 주소 | 비고 |
|--------|------|------|
| Frontend | http://localhost:30000 | 게임 UI |
| Game Server API | http://localhost:30080/api | REST + WS |
| Admin 대시보드 | http://localhost:30001 | 관리자 패널 |
| WebSocket | ws://localhost:30080 | 게임 실시간 통신 |

---

## 2. ArgoCD 접속

ArgoCD는 ClusterIP 타입이므로 port-forward 필요.

```bash
kubectl port-forward -n argocd svc/argocd-server 8080:80
```

| 항목 | 값 |
|------|----|
| URL | http://localhost:8080 |
| ID | `admin` |
| PW | `REDACTED_ARGOCD_PASSWORD` |

> argocd-repo-server가 Error 상태인 경우: `kubectl rollout restart deployment/argocd-repo-server -n argocd`

---

## 3. 전체 서비스 상태 확인

```bash
# 7개 Pod 모두 Running 확인
kubectl get pods -n rummikub

# 개별 로그 확인
kubectl logs -n rummikub deployment/frontend     --tail=30
kubectl logs -n rummikub deployment/game-server  --tail=30
kubectl logs -n rummikub deployment/ai-adapter   --tail=30
```

---

## 4. 연습 모드 수동 테스트

### 접속 및 로그인

1. http://localhost:30000 접속
2. 닉네임 입력 (2~12자) → **게스트로 로그인** 클릭
   - Google OAuth 불필요 (dev-login 사용)
3. 상단 메뉴 → **연습** 선택

### 스테이지별 클리어 조건

| Stage | 이름 | goal | 클리어 조건 | 정답 예시 |
|-------|------|------|-------------|-----------|
| 1 | 그룹 만들기 | group | 유효한 그룹 1개 이상 | R7+B7+Y7 (3색 같은 숫자) |
| 2 | 런 만들기 | run | 유효한 런 1개 이상 | R4+R5+R6 (연속 같은 색) |
| 3 | 조커 활용 | joker | 조커 포함 유효 세트 1개 | JK1+R5+R6 또는 JK1+B7+Y7+K7 |
| 4 | 조커 마스터 | multi | 런 1개 + 그룹 1개 | [JK1+Y8+Y10+Y11] + [R7+B7+K7] |
| 5 | 복합 배치 | multi | 그룹 1개 + 런 1개 | [R7+B7+Y7+K7] + [R8+R9+R10] |
| 6 | 루미큐브 마스터 | master | 유효 타일 12장 이상 | R1~R6 런 + B6+Y6+K6 그룹 + B7+B8+B9 런 |

### 타일 조작법

- **보드로 드래그**: 랙 → 게임 테이블 영역에 드롭
- **새 그룹 생성**: 보드에 타일이 있을 때 "**+ 새 그룹**" 버튼 클릭 후 드래그
- **타입 변경**: 배치된 그룹 하단 "런/그룹" 버튼 토글
- **초기화**: "초기화" 버튼으로 모든 타일 랙으로 복귀

---

## 5. 코드 수정 후 재빌드/배포

### Frontend

```bash
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena/src/frontend

# 빌드 (Next.js standalone)
docker build -t rummiarena/frontend:dev .

# K8s 재배포
kubectl rollout restart deployment/frontend -n rummikub
kubectl rollout status  deployment/frontend -n rummikub
```

### Game Server (Go)

```bash
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena/src/game-server

docker build -t rummiarena/game-server:dev .
kubectl rollout restart deployment/game-server -n rummikub
kubectl rollout status  deployment/game-server -n rummikub
```

### AI Adapter (NestJS)

```bash
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena/src/ai-adapter

docker build -t rummiarena/ai-adapter:dev .
kubectl rollout restart deployment/ai-adapter -n rummikub
kubectl rollout status  deployment/ai-adapter -n rummikub
```

### Admin

```bash
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena/src/admin

docker build -t rummiarena/admin:dev .
kubectl rollout restart deployment/admin -n rummikub
kubectl rollout status  deployment/admin -n rummikub
```

---

## 6. Playwright E2E 자동 테스트

```bash
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena/src/frontend

# 전체 실행 (headless)
npx playwright test --reporter=list

# 특정 스테이지만
npx playwright test e2e/01-stage1-group.spec.ts
npx playwright test e2e/03-stage3-joker.spec.ts   # P1 우선 — 조커 버그 수정 검증

# 브라우저 UI 보면서 실행 (디버깅용)
npx playwright test --headed --slowMo=500

# HTML 리포트 열기
npx playwright show-report
```

### 테스트 파일 목록

| 파일 | 커버 시나리오 |
|------|---------------|
| `e2e/01-stage1-group.spec.ts` | TC-P-101~104 (그룹 룰) |
| `e2e/02-stage2-run.spec.ts` | TC-P-201~204 (런 룰) |
| `e2e/03-stage3-joker.spec.ts` | TC-P-301~304, TC-J (조커) |
| `e2e/04-stage4-multi.spec.ts` | TC-P-401~403 (조커 마스터) |
| `e2e/05-stage5-complex.spec.ts` | TC-P-501~503 (복합 배치) |
| `e2e/06-stage6-master.spec.ts` | TC-P-601~603 (12장 마스터) |

> 첫 실행 시 `global-setup.ts`가 게스트 로그인 세션을 자동 생성합니다 (`e2e/auth.json`).

---

## 7. 트러블슈팅

| 증상 | 조치 |
|------|------|
| Pod CrashLoopBackOff | `kubectl describe pod <pod> -n rummikub` 로 원인 확인 |
| frontend 접속 안 됨 | `kubectl logs deployment/frontend -n rummikub` 확인 |
| 게스트 로그인 실패 | game-server pod 상태 확인 (`/api/auth/dev-login` 의존) |
| Playwright 인증 오류 | `rm e2e/auth.json` 후 재실행 (세션 재생성) |
| argocd-repo-server Error | `kubectl rollout restart deployment/argocd-repo-server -n argocd` |
| 타일 드래그 안 됨 | 브라우저 콘솔 확인, 새로고침 후 재시도 |
