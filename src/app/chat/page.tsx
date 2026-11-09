import ChatPanel from "@/components/ChatPanel";
import data from "@/data/fixed_question.json";

export default function ChatPage() {
  const regions = Object.entries(data.regions).map(([key, region]) => ({
    key,
    name: region.name,
  }));

  return (
    <>
      <h1 className="text-2xl font-bold">주유 챗봇</h1>
      <p className="mt-2 text-foreground/70">지현민·배재원 담당 영역입니다.</p>
      <ChatPanel question={data.meta.question} regions={regions} />
    </>
  );
}
