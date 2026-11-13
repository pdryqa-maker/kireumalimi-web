import type { NextRequest } from "next/server";
import { OpinetError } from "@/lib/opinet";
import { originFrom } from "@/lib/origin";
import { taxCutImpact } from "@/lib/policy";
import { limitByClient } from "@/lib/rateLimit";
import { DEFAULT_KMPL, DEFAULT_LITERS, findByTotalCost } from "@/lib/stations";

const kmplFrom = (params: URLSearchParams) => Number(params.get("kmpl") ?? DEFAULT_KMPL);

// 제도 변경 알림 미리보기: 언제(종료 예정일), 얼마(내 주유량의 최대 금액), 어디서(거리까지 따진 추천)를 한 번에 돌려준다.
// 예: /api/alert-preview?fuel=휘발유&place=eonyang&liters=40
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  const fuel = searchParams.get("fuel") ?? "휘발유";
  const liters = Number(searchParams.get("liters") ?? DEFAULT_LITERS);

  try {
    const tax = taxCutImpact(fuel, liters);
    if ("error" in tax) {
      return Response.json({ error: tax.error }, { status: 400 });
    }
    // 어디서는 오피넷이 안 될 때 빼고 보여 준다. 언제·얼마는 발표값이라 그대로 쓸 수 있다.
    const cost = await findByTotalCost(fuel, originFrom(searchParams), liters, kmplFrom(searchParams)).catch((error) => {
      if (error instanceof OpinetError) return null;
      throw error;
    });
    return Response.json({ tax, cost });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
