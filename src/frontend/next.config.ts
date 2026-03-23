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
    return [
      {
        // NextAuth 내부 경로(/api/auth/*)는 Next.js가 직접 처리 — 제외
        source: "/api/((?!auth).*)",
        destination: `${gameServer}/api/$1`,
      },
    ];
  },
};

export default nextConfig;
