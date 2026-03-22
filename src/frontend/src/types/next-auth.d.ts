import type { DefaultSession, DefaultJWT } from "next-auth";

/**
 * next-auth 타입 확장
 * session.accessToken, session.user.id 를 사용하기 위한 모듈 오그멘테이션
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    accessToken?: string;
    user?: DefaultSession["user"] & {
      id?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    accessToken?: string;
  }
}
