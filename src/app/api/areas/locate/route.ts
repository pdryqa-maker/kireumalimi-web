import type { NextRequest } from "next/server";
import { OpinetError } from "@/lib/opinet";
import { limitByClient } from "@/lib/rateLimit";
import { areaAt } from "@/lib/stations";

// 좌표(KATEC)가 속한 시군구. /api/areas/locate?x=502400&y=330000 → { area: { code: "1831", name: "울산 울주군" } }
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  try {
    const area = await areaAt(Number(params.get("x")), Number(params.get("y")));
    if (!area) {
      return Response.json({ error: "근처 5km 안에 주유소가 없어 지역을 정하지 못했어요. 직접 골라 주세요." }, { status: 404 });
    }
    return Response.json({ area });
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
