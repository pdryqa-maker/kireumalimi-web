import type { NextRequest } from "next/server";
import { fillRequestOrDefault, resolveFill } from "@/lib/fillPrice";
import { OpinetError } from "@/lib/opinet";
import { originFrom } from "@/lib/origin";
import { taxCutImpact } from "@/lib/policy";
import { limitByClient } from "@/lib/rateLimit";
import { DEFAULT_KMPL, findByTotalCost } from "@/lib/stations";

const kmplFrom = (params: URLSearchParams) => Number(params.get("kmpl") ?? DEFAULT_KMPL);

// 제도 변경 알림 미리보기: 언제(종료 예정일), 얼마(내 주유량의 최대 금액), 어디서(거리까지 고려한 추천)를 한 번에 돌려준다.
// 예: /api/alert-preview?fuel=휘발유&place=eonyang&amount=50000. 출발 위치를 고르지 않았으면 place=none(어디서는 빼고 답한다).
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  const fuel = searchParams.get("fuel") ?? "휘발유";

  try {
    const fill = await resolveFill(fuel, fillRequestOrDefault(searchParams));
    // 금액을 리터로 바꿀 평균가를 못 받으면 리터당 금액만 돌려준다.
    const tax = { ...taxCutImpact(fuel, fill?.liters ?? null), fill };
    if ("error" in tax) {
      return Response.json({ error: tax.error }, { status: 400 });
    }
    // 어디서는 오피넷이 안 될 때 빼고 보여 준다. 언제·얼마는 발표값이라 그대로 쓸 수 있다.
    const cost =
      fill && searchParams.get("place") !== "none"
        ? await findByTotalCost(fuel, originFrom(searchParams), fill, kmplFrom(searchParams)).catch((error) => {
            if (error instanceof OpinetError) return null;
            throw error;
          })
        : null;
    return Response.json({ tax, cost });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
