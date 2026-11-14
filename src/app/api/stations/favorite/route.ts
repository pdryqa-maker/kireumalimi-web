import type { NextRequest } from "next/server";
import { prefsFrom } from "@/lib/discounts";
import { OpinetError } from "@/lib/opinet";
import { limitByClient } from "@/lib/rateLimit";
import { findStationByName, isAreaCode, stationStanding } from "@/lib/stations";

// 단골 주유소 점검: 영수증의 주유소 이름으로 오피넷 주유소를 찾고, 동네 평균·반경 5km와 견준다.
// 예: /api/stations/favorite?name=㈜이림 언양주유소&area=1831&fuel=휘발유&discounts=S-OIL:100
// 이름으로 못 찾으면 { found: null, standing: null }
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  try {
    const name = (searchParams.get("name") ?? "").trim().slice(0, 40);
    const area = searchParams.get("area");
    if (area !== null && !isAreaCode(area)) throw new RangeError("지역코드가 올바르지 않습니다.");
    const prefs = prefsFrom(searchParams);
    const found = await findStationByName(name, area);
    if (!found) return Response.json({ found: null, standing: null });
    return Response.json({ found, standing: await stationStanding(found.id, searchParams.get("fuel") ?? "휘발유", prefs) });
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
