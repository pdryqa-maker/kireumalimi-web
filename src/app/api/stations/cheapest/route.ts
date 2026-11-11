import type { NextRequest } from "next/server";
import { OpinetError } from "@/lib/opinet";
import { findCheapest } from "@/lib/stations";

// 예: /api/stations/cheapest?fuel=휘발유&area=1831
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  try {
    return Response.json(
      await findCheapest(searchParams.get("fuel") ?? "휘발유", searchParams.get("area") ?? "18"),
    );
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
