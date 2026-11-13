import type { Metadata } from "next";
import localFont from "next/font/local";
import AppShell from "@/components/AppShell";
import "./globals.css";

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  title: "기름알리미",
  description: "내 위치와 내 차 기준으로 주유소 가격과 연료비를 말로 물어보는 AI. 한국석유공사 오피넷 데이터로 답해요.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
