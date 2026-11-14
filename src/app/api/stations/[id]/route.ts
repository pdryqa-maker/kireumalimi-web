import type { NextRequest } from "next/server";
import { OpinetError } from "@/lib/opinet";
import { limitByClient } from "@/lib/rateLimit";
import { coordsOf, getStation } from "@/lib/stations";

// 예: /api/stations/A0031658
export async function GET(request: NextRequest, ctx: RouteContext<"/api/stations/[id]">) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const { id } = await ctx.params;
  try {
    const station = await getStation(id);
    if (!station) {
      return Response.json({ error: "주유소를 찾지 못했습니다." }, { status: 404 });
    }
    // 답 카드 위 작은 지도에 쓸 이 주유소의 위경도(가격은 유종마다 달라 표시하지 않는다)
    const point = coordsOf(station.id);
    return Response.json({
      ...station,
      map: point ? { origin: null, points: [{ id: station.id, name: station.name, brand: station.brand, price: null, ...point }] } : null,
    });
  } catch (error) {
    if (error instanceof OpinetError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
