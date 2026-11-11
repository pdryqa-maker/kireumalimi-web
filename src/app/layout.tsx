import type { Metadata } from "next";
import localFont from "next/font/local";
import Image from "next/image";
import "./globals.css";

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  title: "기름알리미",
  description: "울산 주유소 가격을 말로 물으면 오피넷 데이터로 답하는 AI",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pt-5 pb-3 sm:px-6">
          <Image src="/brand/yuilmui-mark.png" alt="팀 유일무이 로고" width={36} height={36} priority />
          <span className="text-lg font-bold tracking-tight">기름알리미</span>
          <span className="ml-auto rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft shadow-inset-sm">
            시연 지역 · 울산 울주군
          </span>
        </header>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4 sm:px-6">{children}</main>
        <footer className="px-4 pb-5 text-center text-xs text-ink-soft">
          유가 정보: 한국석유공사 오피넷 제공 · 공공데이터 활용 시제품 · 팀 유일무이
        </footer>
      </body>
    </html>
  );
}
