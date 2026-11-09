import type { NextRequest } from "next/server";

// 오피넷 API를 서버에서 대신 호출한다. 인증키가 브라우저로 나가지 않게 하기 위한 경로다.
const ALLOWED_ENDPOINTS = new Set([
  "avgAllPrice",
  "avgSidoPrice",
  "avgSigunPrice",
  "lowTop10",
  "aroundAll",
  "detailById",
]);
const CACHE_MS = 10 * 60 * 1000; // 일반 키 한도(하루 300회)를 아끼기 위해 같은 요청은 10분간 재사용

// Next의 fetch 캐시는 요청 주소를 파일에 남겨 인증키가 디스크에 저장되므로 메모리에만 보관한다.
const cache = new Map<string, { expires: number; body: unknown }>();

export async function GET(request: NextRequest, ctx: RouteContext<"/api/opinet/[endpoint]">) {
  const { endpoint } = await ctx.params;
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return Response.json({ error: "허용되지 않은 API입니다." }, { status: 404 });
  }

  const key = process.env.OPINET_API_KEY;
  if (!key) {
    return Response.json({ error: "OPINET_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.delete("code");
  params.set("out", "json");
  const cacheKey = `${endpoint}?${params}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return Response.json(cached.body);
  }

  params.set("code", key);
  try {
    const response = await fetch(`https://www.opinet.co.kr/api/${endpoint}.do?${params}`, {
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) {
      return Response.json(body, { status: 502 });
    }
    cache.set(cacheKey, { expires: Date.now() + CACHE_MS, body });
    return Response.json(body);
  } catch {
    // 오류 내용에 인증키가 든 주소가 포함될 수 있어 그대로 돌려주지 않는다.
    return Response.json({ error: "오피넷 호출에 실패했습니다." }, { status: 502 });
  }
}
