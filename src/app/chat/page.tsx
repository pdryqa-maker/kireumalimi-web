import { redirect } from "next/navigation";

// 챗봇은 첫 화면으로 옮겼다. 예전 주소로 들어와도 같은 화면을 보여 준다.
export default function ChatPage() {
  redirect("/");
}
