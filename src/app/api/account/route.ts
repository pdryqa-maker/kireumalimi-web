// 로그인한 계정의 사본. GET은 받기, PUT은 바꾼 칸 올리기, DELETE는 탈퇴.
import { defaultDeps, deleteAccount, getAccount, putAccount } from "@/lib/account/handlers";
import { limitByClient } from "@/lib/rateLimit";

export async function GET(request: Request) {
  return limitByClient(request, "account") ?? getAccount(request, defaultDeps());
}

export async function PUT(request: Request) {
  return limitByClient(request, "account") ?? putAccount(request, defaultDeps());
}

export async function DELETE(request: Request) {
  return limitByClient(request, "account") ?? deleteAccount(request, defaultDeps());
}
