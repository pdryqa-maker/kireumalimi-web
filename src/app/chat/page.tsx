import ChatPanel from "@/components/ChatPanel";
import data from "@/data/fixed_question.json";

// 시연 지역. key는 고정 질문 데이터의 지역, area는 오피넷 지역코드다.
const DEMO_REGION = { key: "ulsan_ulju", area: "1831", name: "울주군" };

export default function ChatPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">주유 챗봇</h1>
      <p className="mt-2 text-foreground/70">
        시연 지역: 울산 {DEMO_REGION.name} · 지현민·배재원 담당 영역입니다.
      </p>
      <ChatPanel fixedQuestion={data.meta.question} region={DEMO_REGION} />
    </>
  );
}
