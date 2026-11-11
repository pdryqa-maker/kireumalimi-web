// 오피넷 API 호출. 인증키는 서버 환경변수에서만 읽는다.
const CACHE_MS = 10 * 60 * 1000; // 일반 키 한도(하루 300회)를 아끼기 위해 같은 요청은 10분간 재사용

// Next의 fetch 캐시는 요청 주소를 파일에 남겨 인증키가 디스크에 저장되므로 메모리에만 보관한다.
const cache = new Map<string, { expires: number; body: unknown; fetchedAt: string }>();

export class OpinetError extends Error {}

// 응답과 함께 오피넷에서 실제로 받아 온 시각(ISO)을 돌려준다. 캐시에서 꺼내도 처음 받은 시각이다.
export async function fetchOpinetTimed(endpoint: string, query: Record<string, string> | URLSearchParams) {
  const key = process.env.OPINET_API_KEY;
  if (!key) {
    throw new OpinetError("OPINET_API_KEY가 설정되지 않았습니다.");
  }

  const params = new URLSearchParams(query);
  params.delete("code");
  params.set("out", "json");
  const cacheKey = `${endpoint}?${params}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return { body: cached.body, fetchedAt: cached.fetchedAt };
  }

  params.set("code", key);
  let body: unknown;
  try {
    const response = await fetch(`https://www.opinet.co.kr/api/${endpoint}.do?${params}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error();
    }
    body = await response.json();
  } catch {
    // 원래 오류에는 인증키가 든 주소가 포함될 수 있어 버린다.
    throw new OpinetError("오피넷 호출에 실패했습니다.");
  }
  const fetchedAt = new Date().toISOString();
  cache.set(cacheKey, { expires: Date.now() + CACHE_MS, body, fetchedAt });
  return { body, fetchedAt };
}

export async function fetchOpinet(endpoint: string, query: Record<string, string> | URLSearchParams) {
  return (await fetchOpinetTimed(endpoint, query)).body;
}
