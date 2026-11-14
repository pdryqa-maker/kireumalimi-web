import type { NextRequest } from "next/server";
import { prefsFrom } from "@/lib/discounts";
import { OpinetError } from "@/lib/opinet";
import { limitByClient } from "@/lib/rateLimit";
import { cleanText, isKatec, LIMITS } from "@/lib/profile";
import { findCommute } from "@/lib/stations";

// 출퇴근 길(데모): 집(hx·hy·hlabel)과 회사(wx·wy·wlabel) 둘 다 있어야 한다. 오피넷 반경 조회를 두 번 한다.
// 예: /api/stations/commute?fuel=휘발유&hx=502243&hy=330555&hlabel=집&wx=510000&wy=331000&wlabel=회사&discounts=S-OIL:100
function placeFrom(params: URLSearchParams, prefix: "h" | "w") {
  const x = Number(params.get(`${prefix}x`));
  const y = Number(params.get(`${prefix}y`));
  if (!params.has(`${prefix}x`) || !isKatec(x, y)) {
    throw new RangeError(prefix === "h" ? "집 위치가 없거나 올바르지 않습니다." : "회사 위치가 없거나 올바르지 않습니다.");
  }
  const name = cleanText(params.get(`${prefix}label`), LIMITS.label) || (prefix === "h" ? "집" : "회사");
  return { name, x: Math.round(x), y: Math.round(y) };
}

export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  try {
    const home = placeFrom(searchParams, "h");
    const work = placeFrom(searchParams, "w");
    return Response.json(await findCommute(searchParams.get("fuel") ?? "휘발유", home, work, prefsFrom(searchParams)));
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
