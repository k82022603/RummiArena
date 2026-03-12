import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/providers/AuthProvider";

export const metadata: Metadata = {
  title: "RummiArena - 루미큐브 AI 대전 플랫폼",
  description:
    "Human + AI 혼합 루미큐브 실시간 대전 플랫폼. OpenAI, Claude, DeepSeek, LLaMA와 대결하세요.",
  keywords: ["루미큐브", "Rummikub", "AI 대전", "LLM", "보드게임"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
