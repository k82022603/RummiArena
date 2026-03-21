import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "RummiArena Admin",
  description: "RummiArena 관리자 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="bg-slate-950 text-slate-200 antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            {/* 글로벌 헤더 */}
            <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center px-6 flex-shrink-0">
              <p className="text-sm text-slate-400">
                RummiArena 관리자 포털
              </p>
              <div className="ml-auto flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
                <span className="text-xs text-slate-400">시스템 정상</span>
              </div>
            </header>

            {/* 페이지 콘텐츠 */}
            <main className="flex-1 p-6 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
