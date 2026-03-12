"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * next-auth SessionProvider 래퍼
 * 클라이언트 컴포넌트로 분리하여 Server 레이아웃에서 사용 가능하게 함
 */
export default function AuthProvider({ children }: AuthProviderProps) {
  return <SessionProvider>{children}</SessionProvider>;
}
