import type { NextRequest } from "next/server";
import { prefsFrom } from "@/lib/discounts";
import { OpinetError } from "@/lib/opinet";
import { originFrom } from "@/lib/origin";
import { limitByClient } from "@/lib/rateLimit";
import { findNearby, mapPointsOf, originPoint } from "@/lib/stations";

// 내 위치 반경 5km 안에서 가격이 낮은 곳. 예: /api/stations/nearby?fuel=휘발유&x=502243&y=330555&label=집
// 내 할인·뺀 상표: &discounts=S-OIL:100&exclude=SK에너지
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  try {
    const origin = originFrom(searchParams);
    const result = await findNearby(searchParams.get("fuel") ?? "휘발유", origin, 5, prefsFrom(searchParams));
    // 답 카드 위 작은 지도에 쓸 출발 위치와 주유소 위경도
    return Response.json({ ...result, map: { origin: originPoint(origin), points: mapPointsOf(result) } });
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
