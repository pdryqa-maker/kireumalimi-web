import type { NextRequest } from "next/server";
import { CAR_QUERY_MAX, searchCars } from "@/lib/carEfficiency";
import { CAR_DATA } from "@/lib/fuelEconomy";
import { PROFILE_FUELS } from "@/lib/profile";
import { limitByClient } from "@/lib/rateLimit";

// 차종 검색(내 정보 화면). 예: /api/cars?q=아반떼 하이브리드 → 공인 도심·고속도로·복합 연비가 붙은 차종 20개까지
// fuel을 주면 그 유종만 찾는다. 받아 둔 표에서 찾으므로 외부 API를 부르지 않는다.
export async function GET(request: NextRequest) {
  const limited = limitByClient(request, "cars");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  const query = (searchParams.get("q") ?? "").trim();
  const fuel = searchParams.get("fuel");
  if (query.length > CAR_QUERY_MAX) {
    return Response.json({ error: `차종 이름은 ${CAR_QUERY_MAX}자 안으로 넣어 주세요.` }, { status: 400 });
  }
  if (fuel && !PROFILE_FUELS.includes(fuel)) {
    return Response.json({ error: "유종은 휘발유, 경유, 자동차부탄 중 하나여야 합니다." }, { status: 400 });
  }
  return Response.json({ cars: searchCars(query, fuel), ...CAR_DATA });
}
