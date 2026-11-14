import type { NextRequest } from "next/server";
import { prefsFrom } from "@/lib/discounts";
import { AMOUNT_ERROR, fillRequestOrDefault, resolveFill } from "@/lib/fillPrice";
import { OpinetError } from "@/lib/opinet";
import { originFrom } from "@/lib/origin";
import { limitByClient } from "@/lib/rateLimit";
import { DEFAULT_KMPL, findByTotalCost, mapPointsOf, originPoint } from "@/lib/stations";

// 예: /api/stations/total-cost?fuel=휘발유&place=eonyang&amount=50000 또는 ...&amount=full&full=40&x=502243&y=330555&label=집
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  const fuel = searchParams.get("fuel") ?? "휘발유";
  try {
    const fill = await resolveFill(fuel, fillRequestOrDefault(searchParams));
    if (!fill) {
      return Response.json({ error: "오늘 평균 판매가를 불러오지 못해 금액을 리터로 바꾸지 못했어요. 잠시 뒤 다시 해 주세요." }, { status: 502 });
    }
    const origin = originFrom(searchParams);
    const result = await findByTotalCost(fuel, origin, fill, Number(searchParams.get("kmpl") ?? DEFAULT_KMPL), prefsFrom(searchParams));
    // 답 카드 위 작은 지도에 쓸 출발 위치와 주유소 위경도(추천 순서대로)
    return Response.json({ ...result, map: { origin: originPoint(origin), points: mapPointsOf({ stations: result.stations }) } });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message || AMOUNT_ERROR }, { status: 400 });
    }
    if (error instanceof OpinetError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
