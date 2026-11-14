import type { Metadata } from "next";
import ExploreDashboard from "@/components/ExploreDashboard";
import data from "@/data/fixed_question.json";
import { DEMO_REGION } from "@/lib/places";

export const metadata: Metadata = {
  title: "탐색 · 기름알리미",
  description: "가까운 최저가, 거리까지 따진 추천, 주유소 점검, 요소수 재고, 고속도로 휴게소를 한 화면에서 찾아보세요.",
};

export default function ExplorePage() {
  return <ExploreDashboard fixedQuestion={data.meta.question} region={DEMO_REGION} />;
}
