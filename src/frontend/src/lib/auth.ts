import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

const providers: NextAuthOptions["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

// 개발용 게스트 로그인 (프로덕션 환경 제외)
providers.push(
  CredentialsProvider({
    id: "dev-login",
    name: "게스트 로그인",
    credentials: {
      userId: { label: "사용자 ID", type: "text" },
      displayName: { label: "닉네임", type: "text" },
    },
    async authorize(credentials) {
      if (!credentials?.userId || !credentials?.displayName) return null;
      try {
        const gameServerUrl =
          process.env.GAME_SERVER_INTERNAL_URL ?? "http://localhost:8080";
        const res = await fetch(`${gameServerUrl}/api/auth/dev-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: credentials.userId,
            displayName: credentials.displayName,
          }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          token: string;
          userId: string;
          displayName: string;
        };
        return {
          id: data.userId,
          name: data.displayName,
          email: `${data.userId}@dev.local`,
          accessToken: data.token,
        };
      } catch {
        return null;
      }
    },
  }),
);

/**
 * next-auth 설정
 * Google OAuth 2.0 기반 인증 + 개발용 게스트 로그인
 */
export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async jwt({ token, account, user }) {
      // 최초 로그인 시 access_token을 토큰에 저장 (Google OAuth)
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      // Credentials 로그인 시 user.accessToken 저장
      const userWithToken = user as unknown as { accessToken?: string };
      if (userWithToken?.accessToken) {
        token.accessToken = userWithToken.accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      // 세션에 accessToken 노출 (클라이언트 → WebSocket 인증용)
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24시간
  },
};
