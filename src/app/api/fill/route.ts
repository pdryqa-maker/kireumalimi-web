import type { NextRequest } from "next/server";
import { fillRequestOrDefault, resolveFill } from "@/lib/fillPrice";
import { limitByClient } from "@/lib/rateLimit";

// 한 번에 넣는 양(금액이나 가득)을 리터로 바꾼다. 알림 화면처럼 브라우저에서 제도 금액을 셈할 때 쓴다.
// 예: /api/fill?fuel=휘발유&amount=50000 → { fill: { label: "5만원어치(약 27L)", liters: 27, ... } }
// 평균가를 못 받으면 fill이 null이다(그때는 리터당 금액만 보여 준다).
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  try {
    return Response.json({ fill: await resolveFill(searchParams.get("fuel") ?? "휘발유", fillRequestOrDefault(searchParams)) });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
