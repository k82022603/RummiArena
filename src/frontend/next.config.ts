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
        source: "/api/:path*",
        destination: `${gameServer}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
