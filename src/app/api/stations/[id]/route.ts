import type { NextRequest } from "next/server";
import { OpinetError } from "@/lib/opinet";
import { limitByClient } from "@/lib/rateLimit";
import { getStation } from "@/lib/stations";

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
    return Response.json(station);
  } catch (error) {
    if (error instanceof OpinetError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
