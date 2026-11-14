// 아이디·비밀번호로 로그인한다. 본문 { id, password }. 10분에 5번 틀리면 잠근다.
import { defaultDeps, login } from "@/lib/account/handlers";
import { limitByClient } from "@/lib/rateLimit";

export async function POST(request: Request) {
  return limitByClient(request, "auth") ?? login(request, defaultDeps());
}
