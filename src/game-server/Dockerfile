# =============================================================================
# game-server Dockerfile — 멀티스테이지 빌드
# Base:    golang:1.24-alpine (빌드)
#          alpine:3.21        (런타임)
# 최종 이미지 목표: ~20 MB
# =============================================================================

# ---- Stage 1: 의존성 다운로드 ------------------------------------------------
# go.mod / go.sum만 먼저 복사해 캐시 레이어를 최대화한다.
FROM golang:1.24-alpine AS deps

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download && go mod verify

# ---- Stage 2: 빌드 -----------------------------------------------------------
FROM deps AS builder

# 소스 전체 복사
COPY . .

# -trimpath  : 바이너리에서 빌드 경로 제거 (재현성 + 보안)
# -ldflags    : 디버그 심볼 제거로 이미지 크기 최소화
# CGO_ENABLED=0: 순수 정적 바이너리 (alpine glibc 불필요)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /app/server \
    ./cmd/server

# ---- Stage 3: 런타임 ---------------------------------------------------------
FROM alpine:3.21 AS runner

# 타임존 데이터 + TLS CA 인증서만 추가 (컨테이너 최소화)
RUN apk --no-cache add ca-certificates tzdata && \
    # non-root 사용자 생성 (uid=1001 고정 — K8s securityContext와 일치)
    addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup

WORKDIR /app

# 바이너리만 복사
COPY --from=builder --chown=appuser:appgroup /app/server ./server

# non-root 실행
USER appuser

EXPOSE 8080

# /health 엔드포인트 (cmd/server/main.go 에 정의됨)
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["/app/server"]
