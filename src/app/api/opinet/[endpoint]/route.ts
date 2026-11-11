import type { NextRequest } from "next/server";
import { fetchOpinet, OpinetError } from "@/lib/opinet";

// 오피넷 API를 서버에서 대신 호출한다. 인증키가 브라우저로 나가지 않게 하기 위한 경로다.
const ALLOWED_ENDPOINTS = new Set([
  "avgAllPrice",
  "avgSidoPrice",
  "avgSigunPrice",
  "lowTop10",
  "aroundAll",
  "detailById",
]);

export async function GET(request: NextRequest, ctx: RouteContext<"/api/opinet/[endpoint]">) {
  const { endpoint } = await ctx.params;
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return Response.json({ error: "허용되지 않은 API입니다." }, { status: 404 });
  }

  try {
    return Response.json(await fetchOpinet(endpoint, request.nextUrl.searchParams));
  } catch (error) {
    if (error instanceof OpinetError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
