import type { Metadata } from "next";
import ChatPanel from "@/components/ChatPanel";
import data from "@/data/fixed_question.json";
import { DEMO_REGION } from "@/lib/places";

export const metadata: Metadata = {
  title: "탐색 · 기름알리미",
  description: "가까운 최저가, 거리까지 따진 추천, 믿을 만한 주유소, 요소수 재고를 물어보세요.",
};

export default function ExplorePage() {
  return <ChatPanel fixedQuestion={data.meta.question} region={DEMO_REGION} section="explore" />;
}
