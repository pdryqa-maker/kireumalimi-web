import type { NextRequest } from "next/server";
import { OpinetError } from "@/lib/opinet";
import { DEFAULT_PLACE } from "@/lib/places";
import { limitByClient } from "@/lib/rateLimit";
import { DEFAULT_KMPL, DEFAULT_LITERS, findByTotalCost } from "@/lib/stations";

// 예: /api/stations/total-cost?fuel=휘발유&place=eonyang&liters=40
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  try {
    return Response.json(
      await findByTotalCost(
        searchParams.get("fuel") ?? "휘발유",
        searchParams.get("place") ?? DEFAULT_PLACE,
        Number(searchParams.get("liters") ?? DEFAULT_LITERS),
        Number(searchParams.get("kmpl") ?? DEFAULT_KMPL),
      ),
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
