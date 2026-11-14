import type { Metadata } from "next";
import RecordsDashboard from "@/components/RecordsDashboard";
import data from "@/data/fixed_question.json";
import { DEMO_REGION } from "@/lib/places";

export const metadata: Metadata = {
  title: "내 기록 · 기름알리미",
  description: "달마다 쓴 기름값을 그래프로 보고, 다음 주유일과 주유 기록을 한눈에 확인하세요.",
};

export default function RecordsPage() {
  return <RecordsDashboard fixedQuestion={data.meta.question} region={DEMO_REGION} />;
}
