# ---- builder ----
FROM golang:1.24-alpine AS builder

WORKDIR /build

# 의존성 캐시 레이어 분리
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /app/server ./cmd/server

# ---- runner ----
FROM alpine:3.21

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/server ./server

EXPOSE 8080

ENTRYPOINT ["/app/server"]
