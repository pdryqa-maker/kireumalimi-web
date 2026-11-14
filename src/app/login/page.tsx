import type { Metadata } from "next";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "로그인 · 기름알리미",
  description: "로그인하면 다른 기기에서도 내 정보와 주유 기록이 그대로 보여요. 내 위치와 내 차를 알려 주면 그 기준으로 안내해요.",
};

export default function LoginPage() {
  return <LoginForm />;
}
