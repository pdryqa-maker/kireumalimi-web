import type { Metadata } from "next";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "간편 로그인 · 기름알리미",
  description: "내 위치와 내 차를 알려 주면 그 기준으로 주유소와 연료비를 안내해요.",
};

export default function LoginPage() {
  return <LoginForm />;
}
