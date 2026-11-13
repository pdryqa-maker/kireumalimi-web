import type { Metadata } from "next";
import AlertsManager from "@/components/AlertsManager";

export const metadata: Metadata = {
  title: "내 알림 조건 · 기름알리미",
  description: "가격, 유류세 인하 종료, 최고가격 고시, 주유 예보 조건을 미리 걸어 두면 맞을 때만 알려 드려요.",
};

export default function AlertsPage() {
  return <AlertsManager />;
}
