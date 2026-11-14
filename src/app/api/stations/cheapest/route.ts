import type { NextRequest } from "next/server";
import { prefsFrom } from "@/lib/discounts";
import { OpinetError } from "@/lib/opinet";
import { limitByClient } from "@/lib/rateLimit";
import { findCheapest, mapPointsOf } from "@/lib/stations";

// 예: /api/stations/cheapest?fuel=휘발유&area=1831 (내 할인·뺀 상표: &discounts=S-OIL:100&exclude=SK에너지)
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  try {
    const result = await findCheapest(searchParams.get("fuel") ?? "휘발유", searchParams.get("area") ?? "18", 5, prefsFrom(searchParams));
    // 답 카드 위 작은 지도에 쓸 점(주유소 위경도). 지역 최저가는 출발 위치가 없다.
    return Response.json({ ...result, map: { origin: null, points: mapPointsOf(result) } });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof OpinetError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
