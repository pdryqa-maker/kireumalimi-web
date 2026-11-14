import type { NextRequest } from "next/server";
import { OpinetError } from "@/lib/opinet";
import { originFrom } from "@/lib/origin";
import { limitByClient } from "@/lib/rateLimit";
import { findUrea } from "@/lib/stations";

// 요소수 재고(알림 탭의 '지금 점검'). 시도 단위로 받고, 위치(x·y)가 있으면 가까운 순으로 3곳.
// 예: /api/stations/urea?sido=31&x=502243&y=330555&label=집
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  try {
    const origin = searchParams.has("x") || searchParams.has("y") ? originFrom(searchParams) : null;
    return Response.json(await findUrea(searchParams.get("sido") ?? "", null, origin, 3));
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
