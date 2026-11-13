import type { Metadata } from "next";
import ChatPanel from "@/components/ChatPanel";
import data from "@/data/fixed_question.json";
import { DEMO_REGION } from "@/lib/places";

export const metadata: Metadata = {
  title: "내 기록 · 기름알리미",
  description: "영수증으로 주유 기록을 남기고, 달마다 쓴 기름값과 다음 주유일을 확인하세요.",
};

export default function RecordsPage() {
  return <ChatPanel fixedQuestion={data.meta.question} region={DEMO_REGION} section="records" />;
}
