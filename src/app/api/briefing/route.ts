import type { NextRequest } from "next/server";
import { fuelBriefing } from "@/lib/briefing";
import { OpinetError } from "@/lib/opinet";
import { limitByClient } from "@/lib/rateLimit";

// 오늘의 기름 소식. /api/briefing?fuel=경유&area=1831 → 전국·내 지역 평균가와 어제 대비
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  try {
    return Response.json(await fuelBriefing(params.get("fuel") ?? "", params.get("area") || null));
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
