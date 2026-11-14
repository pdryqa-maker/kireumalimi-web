// 세션 쿠키를 지운다. 브라우저 쪽 사본은 accountSync가 지운다.
import { logout } from "@/lib/account/handlers";
import { limitByClient } from "@/lib/rateLimit";

export async function POST(request: Request) {
  return limitByClient(request, "auth") ?? logout(request);
}
