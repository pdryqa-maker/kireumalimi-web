import type { NextRequest } from "next/server";
import { OpinetError } from "@/lib/opinet";
import { getStation } from "@/lib/stations";

// 예: /api/stations/A0031658
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/stations/[id]">) {
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
