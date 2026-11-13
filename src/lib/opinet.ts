// 오피넷 API 호출. 인증키는 서버 환경변수에서만 읽는다.
import { LIMITS, take } from "@/lib/rateLimit";

const CACHE_MS = 10 * 60 * 1000; // 일반 키 한도(하루 300회)를 아끼기 위해 같은 요청은 10분간 재사용

// Next의 fetch 캐시는 요청 주소를 파일에 남겨 인증키가 디스크에 저장되므로 메모리에만 보관한다.
const cache = new Map<string, { expires: number; body: unknown; fetchedAt: string }>();

export class OpinetError extends Error {}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

// XML 응답의 <OIL> 묶음을 JSON 응답과 같은 모양({ RESULT: { OIL: [...] } })으로 바꾼다. 값은 모두 글자다.
export function parseOilXml(text: string) {
  // 오류 안내 화면처럼 <RESULT>가 없는 응답은 빈 결과로 넘기지 않고 실패로 본다.
  if (!/<RESULT>/.test(text)) throw new Error("not an Opinet XML result");
  const list = [...text.matchAll(/<OIL>([\s\S]*?)<\/OIL>/g)].map(([, block]) =>
    Object.fromEntries(
      [...block.matchAll(/<([A-Z_]+)>([\s\S]*?)<\/\1>/g)].map(([, tag, value]) => [
        tag,
        value.trim().replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name]),
      ]),
    ),
  );
  return { RESULT: { OIL: list } };
}

// 응답과 함께 오피넷에서 실제로 받아 온 시각(ISO)을 돌려준다. 캐시에서 꺼내도 처음 받은 시각이다.
// 요소수 가격(ureaPrice)은 JSON 응답을 읽지 못해(2026-11-14 실제 배포에서 확인) 9월 점검에서 정상이었던 XML로 받는다.
const XML_ENDPOINTS = new Set(["ureaPrice"]);

export async function fetchOpinetTimed(
  endpoint: string,
  query: Record<string, string> | URLSearchParams,
  cacheMs = CACHE_MS,
) {
  const xml = XML_ENDPOINTS.has(endpoint);
  const key = process.env.OPINET_API_KEY;
  if (!key) {
    throw new OpinetError("OPINET_API_KEY가 설정되지 않았습니다.");
  }

  const params = new URLSearchParams(query);
  params.delete("code");
  params.set("out", xml ? "xml" : "json");
  const cacheKey = `${endpoint}?${params}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return { body: cached.body, fetchedAt: cached.fetchedAt };
  }

  // 캐시에 없을 때만 실제 호출이므로 여기서 하루 호출 수를 센다.
  if (!take("opinetDaily", "all", LIMITS.opinetDaily)) {
    throw new OpinetError("오늘 오피넷 조회 한도에 가까워 잠시 멈췄어요. 내일 다시 시도해 주세요.");
  }

  params.set("code", key);
  let body: unknown;
  let stage = "연결";
  try {
    const response = await fetch(`https://www.opinet.co.kr/api/${endpoint}.do?${params}`, {
      cache: "no-store",
    });
    stage = `HTTP ${response.status}`;
    if (!response.ok) {
      throw new Error();
    }
    stage = `HTTP ${response.status}, ${xml ? "XML" : "JSON"} 읽기(${response.headers.get("content-type") ?? "형식 없음"})`;
    body = xml ? parseOilXml(await response.text()) : await response.json();
  } catch {
    // 원래 오류에는 인증키가 든 주소가 포함될 수 있어 버리고, 서버 기록에는 어느 API가 어느 단계에서 실패했는지만 남긴다.
    console.error(`오피넷 ${endpoint} 실패: ${stage}`);
    throw new OpinetError("오피넷 호출에 실패했습니다.");
  }
  const fetchedAt = new Date().toISOString();
  cache.set(cacheKey, { expires: Date.now() + cacheMs, body, fetchedAt });
  return { body, fetchedAt };
}

export async function fetchOpinet(endpoint: string, query: Record<string, string> | URLSearchParams) {
  return (await fetchOpinetTimed(endpoint, query)).body;
}
