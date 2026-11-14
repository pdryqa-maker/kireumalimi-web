// 아이디·비밀번호로 가입하고 바로 로그인한다. 본문 { id, password }.
import { defaultDeps, signup } from "@/lib/account/handlers";
import { limitByClient } from "@/lib/rateLimit";

export async function POST(request: Request) {
  return limitByClient(request, "auth") ?? signup(request, defaultDeps());
}
