import ChatPanel from "@/components/ChatPanel";
import data from "@/data/fixed_question.json";
import { DEMO_REGION } from "@/lib/places";

export default function Home() {
  return <ChatPanel fixedQuestion={data.meta.question} region={DEMO_REGION} />;
}
