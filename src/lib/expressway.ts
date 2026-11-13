// 고속도로 휴게소 주유소 가격(한국도로공사)과, 출발지에서 가는 길에 앞으로 지날 휴게소.
// 인증키는 서버 환경변수 EX_API_KEY에서만 읽는다. 휴게소 좌표는 고정 표(expresswayPlaces)에 있고 가격만 매번 받는다.
import { DIRECTION_COORDS, STATION_COORDS } from "@/lib/expresswayPlaces";
import { toKatec } from "@/lib/katec";
import { MAX_LITERS } from "@/lib/policy";
import { LIMITS, take } from "@/lib/rateLimit";
import { findNearby, kstTime, resolveOrigin, type Origin } from "@/lib/stations";

const CACHE_MS = 30 * 60 * 1000; // 휴게소 가격은 자주 바뀌지 않아 30분간 재사용한다
const PAGE_ROWS = 99;
const MAX_PAGES = 5; // 지금 226곳이라 3쪽이면 된다
const SHOW = 5; // 앞으로 지날 곳 중 보여 줄 수
const ON_ROUTE_KM = 30; // 출발지에서 이 노선의 가장 가까운 휴게소가 이보다 멀면 노선 밖에서 출발하는 것으로 본다

export const BOARDING_MESSAGE = "타기 전에 넣으면 더 아낄 수 있습니다.";

// 앱 유종 → 도로공사 가격 항목
export const HIGHWAY_FUELS: Record<string, "gasolinePrice" | "diselPrice" | "lpgPrice"> = {
  휘발유: "gasolinePrice",
  경유: "diselPrice",
  자동차부탄: "lpgPrice",
};

// 도로공사 자료의 노선 이름(2026-11-14 기준). AI가 이 중에서 고른다.
export const HIGHWAY_ROUTES = [
  "경부선",
  "광주대구선",
  "남해선",
  "남해선(영암순천)",
  "남해제2지선",
  "동해선",
  "무안광주선",
  "밀양울산선",
  "부산외곽순환선",
  "새만금포항선(대구~포항)",
  "서산영덕선",
  "서울양양선",
  "서천공주선",
  "서해안선",
  "세종포천선",
  "수도권제1순환선",
  "순천완주선",
  "영동선",
  "완주장수선",
  "울산포항선",
  "중부내륙선",
  "중부내륙선의 지선",
  "중부선",
  "중앙선",
  "통영대전선",
  "평택제천선",
  "호남선",
  "호남선의 지선",
];

const BRANDS: Record<string, string> = { AD: "알뜰", SK: "SK에너지", GS: "GS칼텍스", S: "S-OIL", HD: "HD현대오일뱅크" };

export class HighwayError extends Error {}

type Row = Record<string, unknown>;
type Point = { x: number; y: number };

const cache: { expires: number; rows: Row[]; fetchedAt: string } = { expires: 0, rows: [], fetchedAt: "" };

async function fetchPage(key: string, page: number) {
  const params = new URLSearchParams({ key, type: "json", numOfRows: String(PAGE_ROWS), pageNo: String(page) });
  let stage = "연결";
  try {
    const response = await fetch(`https://data.ex.co.kr/openapi/business/curStateStation?${params}`, { cache: "no-store" });
    stage = `HTTP ${response.status}`;
    if (!response.ok) throw new Error();
    const body = (await response.json()) as { code?: string; list?: Row[]; pageSize?: number };
    stage = `응답 코드 ${body.code ?? "없음"}`;
    if (body.code !== "SUCCESS" || !Array.isArray(body.list)) throw new Error();
    return { list: body.list, pages: Number(body.pageSize) || 1 };
  } catch {
    // 원래 오류에는 인증키가 든 주소가 있을 수 있어 버리고, 서버 기록에는 단계만 남긴다.
    console.error(`도로공사 curStateStation ${page}쪽 실패: ${stage}`);
    throw new HighwayError("도로공사 휴게소 가격을 불러오지 못했습니다.");
  }
}

async function loadStations() {
  if (cache.expires > Date.now()) return cache;
  const key = process.env.EX_API_KEY;
  if (!key) throw new HighwayError("EX_API_KEY가 설정되지 않았습니다.");
  if (!take("exDaily", "all", LIMITS.exDaily)) {
    throw new HighwayError("오늘 도로공사 조회 한도에 가까워 잠시 멈췄어요. 내일 다시 시도해 주세요.");
  }
  const first = await fetchPage(key, 1);
  const rows = [...first.list];
  for (let page = 2; page <= Math.min(first.pages, MAX_PAGES); page++) rows.push(...(await fetchPage(key, page)).list);
  Object.assign(cache, { expires: Date.now() + CACHE_MS, rows, fetchedAt: new Date().toISOString() });
  return cache;
}

// "1,864원" → 1864. 판매하지 않으면 "X"로 온다.
export function wonOf(value: unknown) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  const won = Number(digits);
  return digits && won > 0 ? won : null;
}

// 방향이 비어 있으면 이름 괄호 안의 방향을 쓴다(예: 처인(포천)주유소 → 포천).
const directionOf = (row: Row) => String(row.direction ?? "").trim() || /\(([^)]+)\)주유소$/.exec(String(row.serviceAreaName))?.[1] || "";

// 노선 이름 비교: 띄어쓰기와 끝의 '고속도로'·'선'을 빼고, 다르게 부르는 노선은 도로공사 이름으로 바꾼다.
const ROUTE_ALIASES: Record<string, string> = { 함양울산: "밀양울산", 당진영덕: "서산영덕" };
function routeKey(text: string) {
  const key = text.replace(/\s/g, "").replace(/(고속도로|선)$/, "");
  return ROUTE_ALIASES[key] ?? key;
}

function katecOf(coords: readonly [number, number] | undefined): Point | null {
  return coords ? toKatec(coords[0], coords[1]) : null;
}

const meters = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const km = (m: number) => Math.round(m / 100) / 10;

// 노선·방향의 휴게소 주유소를 출발지에서 지나는 순서대로 돌려주고, 출발지가 있으면 근처 최저가와 견준다.
// liters가 null이면(금액을 리터로 바꾸지 못함) 리터당 차이만 주고 아끼는 금액(savingWon)은 null이다.
export async function highwayStations(fuel: string, route: string, direction: string, origin: Origin | null, liters: number | null) {
  const field = HIGHWAY_FUELS[fuel];
  if (!field) throw new RangeError("고속도로 휴게소 가격은 휘발유, 경유, LPG(자동차부탄)만 있습니다.");
  if (liters !== null && (!Number.isInteger(liters) || liters < 1 || liters > MAX_LITERS)) {
    throw new RangeError(`주유량은 1~${MAX_LITERS}리터 사이 정수여야 합니다.`);
  }
  const place = origin === null ? null : resolveOrigin(origin);
  if (origin !== null && !place) throw new RangeError("출발 위치가 올바르지 않습니다.");

  const { rows, fetchedAt } = await loadStations();
  const onRoute = rows.filter((row) => routeKey(String(row.routeName ?? "")) === routeKey(route));
  if (onRoute.length === 0) {
    throw new RangeError(`도로공사 자료에서 '${route}' 노선의 휴게소 주유소를 찾지 못했습니다. 고를 수 있는 노선: ${HIGHWAY_ROUTES.join(", ")}`);
  }
  const directions = [...new Set(onRoute.map(directionOf).filter(Boolean))];
  const wanted = direction.replace(/방향|\s/g, "");
  if (!directions.includes(wanted)) {
    throw new RangeError(`${route}에는 '${direction}' 방향이 없습니다. 이 노선의 방향: ${directions.join(", ")}`);
  }

  const stations = onRoute
    .filter((row) => directionOf(row) === wanted)
    .map((row) => {
      const name = String(row.serviceAreaName);
      return {
        name,
        brand: BRANDS[String(row.oilCompany)] ?? String(row.oilCompany ?? ""),
        phone: String(row.telNo ?? ""),
        pricePerLiter: wonOf(row[field]),
        at: katecOf(STATION_COORDS[name]),
      };
    });
  const located = stations.filter((station) => station.at !== null);
  const unlocated = stations.filter((station) => station.at === null);

  // 순서: 방향 도시까지 먼 곳부터(= 그쪽으로 가며 지나는 순서). 방향 도시 좌표가 없으면 출발지에서 가까운 순.
  const end = katecOf(DIRECTION_COORDS[wanted]);
  const toEnd = (point: Point) => (end ? meters(point, end) : 0);
  const fromStart = (point: Point) => (place ? meters(place, point) : 0);
  const nearestKm = place && located.length > 0 ? km(Math.min(...located.map((station) => fromStart(station.at!)))) : null;
  const startsOnRoute = nearestKm === null ? null : nearestKm <= ON_ROUTE_KM;
  const ahead = located
    .filter((station) => !(place && end && startsOnRoute) || toEnd(station.at!) < toEnd(place))
    .sort((a, b) => (end ? toEnd(b.at!) - toEnd(a.at!) : fromStart(a.at!) - fromStart(b.at!)))
    .map((station, index) => ({
      order: index + 1,
      name: station.name,
      brand: station.brand,
      phone: station.phone,
      pricePerLiter: station.pricePerLiter,
      distanceKm: place ? km(fromStart(station.at!)) : null,
    }));
  const priced = ahead.filter((station) => station.pricePerLiter !== null);
  const cheapest = priced.length > 0 ? priced.reduce((low, station) => (station.pricePerLiter! < low.pricePerLiter! ? station : low)) : null;
  const average = priced.length > 0 ? Math.round(priced.reduce((sum, station) => sum + station.pricePerLiter!, 0) / priced.length) : null;

  let beforeBoarding = null;
  let beforeBoardingNote: string | null = null;
  if (origin !== null && average !== null && cheapest) {
    try {
      const nearby = await findNearby(fuel, origin, 1);
      const best = nearby.stations[0];
      if (best) {
        const vsAverageWon = average - best.price;
        beforeBoarding = {
          place: nearby.place,
          station: best.name,
          brand: best.brand,
          pricePerLiter: best.price,
          distanceKm: best.distanceKm,
          fetchedAtKst: nearby.fetchedAtKst,
          vsAverageWon,
          vsCheapestWon: cheapest.pricePerLiter! - best.price,
          liters,
          // 근처가 더 비싸면 아끼는 돈은 없다(0). 얼마나 비싼지는 vsAverageWon(음수)에 있다.
          savingWon: liters === null ? null : vsAverageWon > 0 ? Math.round(vsAverageWon * liters) : 0,
          message: vsAverageWon > 0 ? BOARDING_MESSAGE : "출발지 근처가 이 길 휴게소 평균보다 싸지 않아, 휴게소에서 넣어도 됩니다.",
        };
      } else {
        beforeBoardingNote = `${nearby.place} 반경 ${nearby.radiusKm}km 안에 이 유종을 파는 주유소가 없습니다.`;
      }
    } catch {
      beforeBoardingNote = "출발지 근처 주유소 가격을 불러오지 못해 출발 전 비교는 빼고 답합니다.";
    }
  }

  return {
    route: String(onRoute[0].routeName),
    direction: wanted,
    fuel,
    from: place?.name ?? null,
    startsOnRoute,
    order: !place
      ? `${wanted} 방향으로 가며 지나는 순서(노선 전체)`
      : startsOnRoute
        ? `${place.name}에서 ${wanted} 방향으로 가며 앞으로 지날 순서`
        : `${place.name}에서 이 노선의 가장 가까운 휴게소까지 직선 ${nearestKm}km라 노선 전체를 ${wanted} 방향으로 가며 지나는 순서로`,
    fetchedAtKst: kstTime(fetchedAt),
    ahead: ahead.slice(0, SHOW),
    remaining: Math.max(ahead.length - SHOW, 0),
    cheapest,
    average,
    unlocated: unlocated.map(({ name, pricePerLiter }) => ({ name, pricePerLiter })),
    beforeBoarding,
    beforeBoardingNote,
    note:
      "휴게소 가격은 한국도로공사가 제공한 현재 값이며 갱신 시각은 따로 나오지 않습니다. 순서와 거리는 직선거리로 어림한 것이라 실제 도로로는 더 멉니다. 가격이 null이면 그 유종 가격 정보가 없는 곳입니다.",
  };
}
