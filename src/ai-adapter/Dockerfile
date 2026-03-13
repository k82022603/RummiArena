# =============================================================================
# ai-adapter Dockerfile — NestJS 멀티스테이지 빌드
# Base: node:22-alpine
# 엔트리포인트: node dist/main.js
# 최종 이미지 목표: ~200 MB (LLM 클라이언트 라이브러리 포함)
# =============================================================================

# ---- Stage 1: 전체 의존성 설치 + 빌드 ----------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# package.json / lock 파일만 먼저 복사 (레이어 캐시 최대화)
COPY package.json package-lock.json ./

# devDependencies 포함 설치 (TypeScript 컴파일에 필요)
RUN npm ci --prefer-offline

# 소스 복사 후 TypeScript 빌드
COPY . .
RUN npm run build

# ---- Stage 2: 프로덕션 의존성만 재설치 ----------------------------------------
# devDependencies를 제거해 런타임 이미지 크기를 최소화한다.
FROM node:22-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --omit=dev

# ---- Stage 3: 런타임 ---------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# non-root 사용자 생성 (uid=1001)
RUN addgroup -g 1001 -S nodejs && \
    adduser  -u 1001 -S nestjs -G nodejs

ENV NODE_ENV=production
ENV PORT=8081

# 컴파일된 JS + 프로덕션 의존성만 복사
COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder   --chown=nestjs:nodejs /app/dist         ./dist

USER nestjs

EXPOSE 8081

# NestJS Health 엔드포인트 (src/health/health.controller.ts 에 정의됨)
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1

CMD ["node", "dist/main.js"]
