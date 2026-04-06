import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// SEC-ADD-002: OWASP 권장 보안 응답 헤더
// ---------------------------------------------------------------------------
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      "connect-src 'self' ws://localhost:* wss://localhost:* http://localhost:* https://localhost:*",
      "font-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        // 모든 경로에 보안 헤더 적용
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    const gameServer =
      process.env.GAME_SERVER_INTERNAL_URL ?? "http://localhost:8080";
    // /api/auth/* 는 Next.js가 직접 처리 (app/api/auth/[...nextauth]/route.ts)
    // 나머지 경로만 game-server로 명시적으로 프록시
    const prefixes = ["rooms", "games", "practice", "rankings", "users"];
    return prefixes.flatMap((prefix) => [
      {
        source: `/api/${prefix}`,
        destination: `${gameServer}/api/${prefix}`,
      },
      {
        source: `/api/${prefix}/:path*`,
        destination: `${gameServer}/api/${prefix}/:path*`,
      },
    ]);
  },
};

export default nextConfig;
