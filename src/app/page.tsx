import ChatPanel from "@/components/ChatPanel";
import data from "@/data/fixed_question.json";

// 시연 지역. key는 고정 질문 데이터의 지역, area는 오피넷 지역코드다.
const DEMO_REGION = { key: "ulsan_ulju", area: "1831", name: "울주군" };

export default function Home() {
  return <ChatPanel fixedQuestion={data.meta.question} region={DEMO_REGION} />;
}
