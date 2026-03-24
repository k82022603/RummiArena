import type { NextConfig } from "next";

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
