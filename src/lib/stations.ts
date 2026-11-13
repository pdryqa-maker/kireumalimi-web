// 챗봇이 쓸 주유소 조회 기능. 화면의 결과 카드와 나중에 붙일 AI 도구가 함께 쓴다.
import { fetchOpinet, fetchOpinetTimed } from "@/lib/opinet";
import { PLACES } from "@/lib/places";
import { MAX_LITERS } from "@/lib/policy";

export const FUEL_CODES: Record<string, string> = {
  휘발유: "B027",
  고급휘발유: "B034",
  경유: "D047",
  실내등유: "C004",
  자동차부탄: "K015",
};

// 시연 지역: 울산. 코드는 오피넷 지역코드 API 응답 기준이다.
export const ULSAN_AREAS: Record<string, string> = {
  "18": "울산 전체",
  "1801": "울산 중구",
  "1802": "울산 남구",
  "1803": "울산 동구",
  "1804": "울산 북구",
  "1831": "울산 울주군",
};

// 자영알뜰은 API 가이드에 RTE로 적혀 있지만 실제 응답은 RTO다(9월 점검).
const BRANDS: Record<string, string> = {
  SKE: "SK에너지",
  GSC: "GS칼텍스",
  HDO: "HD현대오일뱅크",
  SOL: "S-OIL",
  RTO: "자영알뜰",
  RTE: "자영알뜰",
  RTX: "고속도로알뜰",
  NHO: "농협알뜰",
  ETC: "자가상표",
  E1G: "E1",
  SKG: "SK가스",
};

const FUEL_NAMES = Object.fromEntries(Object.entries(FUEL_CODES).map(([name, code]) => [code, name]));

type Row = Record<string, string | number | undefined>;

function rows(body: unknown): Row[] {
  const oil = (body as { RESULT?: { OIL?: Row[] } })?.RESULT?.OIL;
  return Array.isArray(oil) ? oil : [];
}

function brandName(code: unknown) {
  return BRANDS[String(code)] ?? String(code ?? "");
}

// TRADE_DT 20261111, TRADE_TM 093000 → "2026-11-11 09:00"
function tradeTime(date: unknown, time: unknown) {
  const d = String(date ?? "");
  const t = String(time ?? "").padStart(6, "0");
  if (d.length !== 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${t.slice(0, 2)}:${t.slice(2, 4)}`;
}

// ISO 시각 → "2026-11-13 15:32" (한국 시간). AI가 시각을 옮겨 적을 때 이 값을 쓴다.
export function kstTime(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export async function findCheapest(fuel: string, area: string, count = 5) {
  const prodcd = FUEL_CODES[fuel];
  if (!prodcd || !(area in ULSAN_AREAS)) {
    throw new RangeError("지원하지 않는 유종 또는 지역입니다.");
  }
  const { body, fetchedAt } = await fetchOpinetTimed("lowTop10", { prodcd, area, cnt: String(count) });
  return {
    fuel,
    area: ULSAN_AREAS[area],
    // 최저가 API에는 가격별 기준 시각이 없어, 오피넷에서 조회한 시각을 따로 준다(상세 정보의 기준 시각과 다름).
    fetchedAt,
    fetchedAtKst: kstTime(fetchedAt),
    stations: rows(body).map((row) => ({
      id: String(row.UNI_ID),
      name: String(row.OS_NM),
      brand: brandName(row.POLL_DIV_CD),
      price: Number(row.PRICE),
      address: String(row.NEW_ADR || row.VAN_ADR || ""),
    })),
  };
}

export async function getStation(id: string) {
  const [row] = rows(await fetchOpinet("detailById", { id }));
  if (!row) {
    return null;
  }
  const prices = (row.OIL_PRICE as unknown as Row[] | undefined) ?? [];
  return {
    id: String(row.UNI_ID),
    name: String(row.OS_NM),
    // detailById만 상표 필드명이 POLL_DIV_CO다(lowTop10은 POLL_DIV_CD).
    brand: brandName(row.POLL_DIV_CO),
    address: String(row.NEW_ADR || row.VAN_ADR || ""),
    phone: String(row.TEL ?? ""),
    qualityCertified: row.KPETRO_YN === "Y",
    prices: prices.map((price) => ({
      fuel: FUEL_NAMES[String(price.PRODCD)] ?? String(price.PRODCD),
      price: Number(price.PRICE),
      updatedAt: tradeTime(price.TRADE_DT, price.TRADE_TM),
    })),
  };
}

export const DEFAULT_LITERS = 40;
export const DEFAULT_KMPL = 12;
const RADIUS_M = 5000; // 오피넷 반경 조회의 최대값

// 실질비용: 기름값(가격 × 주유량)에 출발 위치에서 그 주유소까지 오가는 연료비를 더한 값.
// 거리는 오피넷이 주는 직선거리라 실제 도로보다 짧다. 그래서 오가는 연료비는 적게 잡힌 값이다.
export async function findByTotalCost(fuel: string, placeKey: string, liters = DEFAULT_LITERS, kmpl = DEFAULT_KMPL) {
  const prodcd = FUEL_CODES[fuel];
  const place = PLACES[placeKey];
  if (!prodcd || !place) {
    throw new RangeError("지원하지 않는 유종 또는 위치입니다.");
  }
  if (!Number.isInteger(liters) || liters < 1 || liters > MAX_LITERS) {
    throw new RangeError(`주유량은 1~${MAX_LITERS}리터 사이 정수여야 합니다.`);
  }
  if (!Number.isFinite(kmpl) || kmpl < 1 || kmpl > 50) {
    throw new RangeError("연비는 1~50km/L 사이여야 합니다.");
  }

  const { body, fetchedAt } = await fetchOpinetTimed("aroundAll", {
    x: String(place.x),
    y: String(place.y),
    radius: String(RADIUS_M),
    prodcd,
    sort: "1",
  });
  const all = rows(body)
    .map((row) => {
      const price = Number(row.PRICE);
      const distanceM = Number(row.DISTANCE);
      const fillWon = Math.round(price * liters);
      const tripWon = Math.round(((2 * distanceM) / 1000 / kmpl) * price);
      return {
        id: String(row.UNI_ID),
        name: String(row.OS_NM),
        brand: brandName(row.POLL_DIV_CD),
        price,
        distanceKm: Math.round(distanceM / 100) / 10,
        fillWon,
        tripWon,
        totalWon: fillWon + tripWon,
      };
    })
    .filter((station) => station.price > 0 && Number.isFinite(station.distanceKm));

  const base = {
    fuel,
    place: place.name,
    liters,
    kmpl,
    radiusKm: RADIUS_M / 1000,
    fetchedAt,
    fetchedAtKst: kstTime(fetchedAt),
    distanceNote: "거리는 직선거리라 실제 도로는 더 깁니다.",
  };
  if (all.length === 0) {
    return { ...base, stations: [], cheapest: null, nearest: null, extraForCheapestWon: 0, breakEvenWonPerKm: null };
  }

  const byTotal = [...all].sort((a, b) => a.totalWon - b.totalWon || a.distanceKm - b.distanceKm);
  const cheapest = [...all].sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm)[0];
  const nearest = [...all].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const best = byTotal[0];
  return {
    ...base,
    stations: byTotal.slice(0, 5),
    cheapest,
    nearest,
    // 가장 싼 곳까지 가면 가장 덜 드는 곳보다 총비용이 얼마나 더 드는지. 같은 곳이면 0.
    extraForCheapestWon: cheapest.totalWon - best.totalWon,
    // 1km 더 멀면(왕복 2km) 드는 연료비를 주유량으로 나눈 값. 리터당 이만큼 싸야 더 가는 보람이 있다.
    breakEvenWonPerKm: Math.round(((2 / kmpl) * best.price) / liters),
  };
}
