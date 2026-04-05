# =============================================================================
# admin Dockerfile — Next.js 16 멀티스테이지 빌드 (standalone 모드)
# Base: node:22-alpine
# next.config.ts: output: "standalone" 설정 필수
# 포트: 3001 (frontend 3000과 충돌 방지)
# 최종 이미지 목표: ~150 MB
# =============================================================================

# ---- Stage 1: 의존성 설치 ----------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

# ---- Stage 2: 빌드 -----------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 빌드 타임 환경변수
ARG NEXT_PUBLIC_API_URL=http://game-server:8080
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
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
ENV HOSTNAME=0.0.0.0
ENV PORT=3001

# Next.js standalone 출력물 복사
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

# 소스맵 제거 — 프로덕션 이미지에서 소스 역공학 차단 (SEC-SM-001)
RUN find /app -name "*.map" -delete

USER nextjs

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:3001/ || exit 1

CMD ["node", "server.js"]
