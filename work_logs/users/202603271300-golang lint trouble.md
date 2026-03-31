이번 건은 Kubernetes 문제가 아니라 👉 **CI 파이프라인에서 lint 단계가 실패해서 빌드 자체가 막힌 상황**입니다.

---

# 🔥 핵심 원인

마지막 줄 보면 끝입니다:

```bash
ERROR: Job failed: command terminated with exit code 1
```

그 바로 위:

```bash
golangci-lint run ./... --timeout 5m
```

👉 여기서 실패

---

# ❌ 실제 에러 내용

```bash
S1039: unnecessary use of fmt.Sprintf
S1024: should use time.Until
S1016: struct literal 대신 타입 변환 사용
```

👉 즉:

> ❗ **코드 품질(lint) 규칙 위반 → CI 실패**

---

# 🧠 왜 이전엔 됐고 지금은 실패?

가능한 이유 3가지:

### 1. lint 규칙 강화됨

* `.golangci.yml` 변경
* 또는 GitLab Runner / golangci-lint 버전 업데이트

### 2. 코드 변경됨

* 최근 커밋에서 lint 걸리는 코드 추가됨

### 3. CI 정책

```bash
--exit-code 1
```

👉 lint warning도 "실패"로 처리

---

# ✅ 해결 방법 (3가지 전략)

---

## 🚀 방법 1: 코드 수정 (정석 ⭐⭐⭐)

### 1️⃣ fmt.Sprintf 제거

```go
// 기존
fmt.Sprintf("/api/users/test-user1/rating/history?limit=-1")

// 수정
"/api/users/test-user1/rating/history?limit=-1"
```

---

### 2️⃣ time.Sub → time.Until

```go
// 기존
time.Unix(expiryUnix, 0).Sub(time.Now())

// 수정
time.Until(time.Unix(expiryUnix, 0))
```

---

### 3️⃣ struct literal → 타입 변환

```go
// 기존
EloTierCount{Tier: res.Tier, Count: res.Count}

// 수정 (예시)
EloTierCount(res)
```

👉 단, 타입 구조 동일해야 가능

---

## ⚡ 방법 2: lint 무시 (빠른 우회)

### 특정 라인 무시

```go
//nolint:staticcheck
req := httptest.NewRequest(...)
```

---

## ⚠️ 방법 3: CI에서 lint 끄기 (비추천)

`.gitlab-ci.yml`:

```yaml
script:
  - golangci-lint run ./... || true
```

👉 이건 “품질 포기”라 권장 안함

---

# 🔍 지금 상황 정확한 흐름

```
코드 push
 → GitLab CI 실행
   → lint 단계 실패 ❌
     → docker build 안감
       → 이미지 push 안됨
         → Kubernetes는 이전 이미지 or 없음
           → ErrImageNeverPull 발생
```

---

# 💡 왜 Kubernetes까지 영향?

너가 겪은 흐름 연결하면:

1. admin → 이미지 없음 (pull 실패)
2. 이유 → GitLab registry에 최신 이미지 없음
3. 이유 → CI 실패
4. 이유 → lint 실패 ← 🔥 지금 여기

---

# ✅ 추천 액션 (현실적인 순서)

### 1️⃣ lint 에러 3개 수정

👉 5분 컷

### 2️⃣ 다시 push

```bash
git add .
git commit -m "fix(lint): resolve golangci-lint issues"
git push
```

### 3️⃣ CI 성공 확인

→ docker push까지 가는지 확인

### 4️⃣ ArgoCD sync

```bash
argocd app sync rummikub
```

---

# 🔥 한 줄 결론

👉 지금 문제는 인프라가 아니라:

> **"golangci-lint가 빌드를 막고 있음"**

---

