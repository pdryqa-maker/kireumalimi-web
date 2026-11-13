import type { NextRequest } from "next/server";
import { OpinetError } from "@/lib/opinet";
import { limitByClient } from "@/lib/rateLimit";
import { areaList } from "@/lib/stations";

// 오피넷 지역코드 목록. /api/areas → 시도, /api/areas?sido=18 → 그 시도의 시군구
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  try {
    return Response.json({ areas: await areaList(request.nextUrl.searchParams.get("sido") ?? "") });
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
