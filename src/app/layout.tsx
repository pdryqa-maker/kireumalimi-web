import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "기름알리미",
  description: "기름이 떨어지기 전에 먼저 알려 주고, 말로 물으면 답하는 AI",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-foreground/15">
          <nav className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-4">
            <Link href="/" className="font-bold">
              기름알리미
            </Link>
            <Link href="/kerosene" className="text-sm">
              등유 안심
            </Link>
            <Link href="/chat" className="text-sm">
              주유 챗봇
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-foreground/15 px-4 py-4 text-center text-xs text-foreground/60">
          유가 정보: 한국석유공사 오피넷 제공 · 공공데이터 활용 시제품
        </footer>
      </body>
    </html>
  );
}
