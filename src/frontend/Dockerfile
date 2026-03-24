# =============================================================================
# frontend Dockerfile — Next.js 15 멀티스테이지 빌드 (standalone 모드)
# Base: node:22-alpine
# next.config.ts: output: "standalone" 설정 필수
# 최종 이미지 목표: ~150 MB
# =============================================================================

# ---- Stage 1: 의존성 설치 ----------------------------------------------------
# package.json / lock 파일만 먼저 복사해 npm ci 레이어를 캐시한다.
FROM node:22-alpine AS deps

WORKDIR /app

# package-lock.json 존재 시 npm ci로 재현성 보장
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

# ---- Stage 2: 빌드 -----------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# 의존성 레이어 재사용 (캐시 히트)
COPY --from=deps /app/node_modules ./node_modules

# 소스 전체 복사
COPY . .

# GAME_SERVER_INTERNAL_URL: next.config.ts rewrite 대상 (빌드 타임에 컴파일됨)
# NEXT_PUBLIC_WS_URL: 브라우저 WebSocket 주소 (클라이언트 번들에 포함)
ARG GAME_SERVER_INTERNAL_URL=http://game-server:8080
ARG NEXT_PUBLIC_WS_URL=ws://localhost:30080

ENV GAME_SERVER_INTERNAL_URL=${GAME_SERVER_INTERNAL_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
# 텔레메트리 비활성화 (빌드 시간 단축)
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- Stage 3: 런타임 ---------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# non-root 사용자 생성 (uid=1001)
RUN addgroup -g 1001 -S nodejs && \
    adduser  -u 1001 -S nextjs -G nodejs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# standalone 서버가 바인딩할 호스트 (0.0.0.0 필수 — 컨테이너 외부 접근)
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# next.config.ts rewrite 런타임 대상 (K8s 서비스명으로 오버라이드 가능)
ENV GAME_SERVER_INTERNAL_URL=http://game-server:8080
# NEXTAUTH_URL, NEXTAUTH_SECRET 는 K8s Secret으로 주입 (여기에 하드코딩하지 말 것)

# Next.js standalone 출력물 복사
# standalone에 server.js + 필요한 node_modules가 포함됨
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
# frontend에 public 디렉토리가 없으므로 조건부 복사 생략
# (public 디렉토리 추가 시 아래 줄 주석 해제)
# COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# Next.js standalone이 직접 HTTP를 서빙하는 /health 경로가 없으므로
# 루트 경로 접근으로 생존 확인
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
