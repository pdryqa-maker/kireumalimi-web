// 챗봇이 쓸 주유소 조회 기능. 화면의 결과 카드와 나중에 붙일 AI 도구가 함께 쓴다.
import { litersFill, type Fill } from "@/lib/fillAmount";
import { DEFAULT_KMPL } from "@/lib/fuelEconomy";
import { fetchOpinet, fetchOpinetTimed } from "@/lib/opinet";
import { placeAt } from "@/lib/places";
import { MAX_LITERS } from "@/lib/policy";
import type { LedgerEntry } from "@/lib/ledger";
import { isKatec } from "@/lib/profile";
import { fromKatec } from "@/lib/katec";
import { effectivePrice, isExcluded, NO_PREFS, type Prefs } from "@/lib/discounts";
import { coreName, sameStation, searchName } from "@/lib/stationName";

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

export function rows(body: unknown): Row[] {
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

export const isAreaCode = (code: string) => /^\d{2}(\d{2})?$/.test(code);
const AREA_CACHE_MS = 24 * 60 * 60 * 1000; // 지역코드는 거의 바뀌지 않는다

// 오피넷 지역코드. sido를 비우면 시도 목록, 시도 코드(2자리)를 주면 그 시도의 시군구 목록이다.
export async function areaList(sido = "") {
  if (sido && !/^\d{2}$/.test(sido)) throw new RangeError("시도 코드는 2자리 숫자입니다.");
  const { body } = await fetchOpinetTimed("areaCode", sido ? { area: sido } : {}, AREA_CACHE_MS);
  return rows(body)
    .map((row) => ({ code: String(row.AREA_CD ?? ""), name: String(row.AREA_NM ?? "") }))
    .filter((area) => isAreaCode(area.code) && area.name);
}

// 지역코드 → "울산 울주군". 울산은 미리 적어 둔 이름을 쓰고, 다른 지역은 오피넷 지역코드 목록에서 찾는다.
export async function areaName(code: string) {
  if (code in ULSAN_AREAS) return ULSAN_AREAS[code];
  const sido = (await areaList()).find((area) => area.code === code.slice(0, 2));
  if (!sido) throw new RangeError("찾을 수 없는 지역코드입니다.");
  if (code.length === 2) return sido.name;
  const sigun = (await areaList(sido.code)).find((area) => area.code === code);
  if (!sigun) throw new RangeError("찾을 수 없는 지역코드입니다.");
  return `${sido.name} ${sigun.name}`;
}

// 사람들이 쓰는 시도 이름 → 오피넷 시도 이름. 오피넷은 광주와 전남을 '전남광주' 하나로 준다.
const SIDO_ALIASES: Record<string, string[]> = {
  서울: ["서울특별시", "서울시"],
  부산: ["부산광역시", "부산시"],
  대구: ["대구광역시", "대구시"],
  인천: ["인천광역시", "인천시"],
  대전: ["대전광역시", "대전시"],
  울산: ["울산광역시", "울산시"],
  세종: ["세종특별자치시", "세종시"],
  경기: ["경기도"],
  강원: ["강원특별자치도", "강원도"],
  충북: ["충청북도"],
  충남: ["충청남도"],
  전북: ["전북특별자치도", "전라북도"],
  경북: ["경상북도"],
  경남: ["경상남도"],
  제주: ["제주특별자치도", "제주도"],
  // 2026년 7월 1일 전남광주통합특별시 출범. 예전 이름(광주광역시, 전라남도)으로 물어도 찾는다.
  전남광주: ["전남광주통합특별시", "전남광주특별시", "광주광역시", "전라남도", "전남", "광주"],
};

const squash = (text: string) => text.replace(/\s+/g, "");
// '해운대구' ↔ '해운대'. '중구'처럼 두 글자 이름은 줄이지 않는다.
const stem = (name: string) => (name.length > 2 ? name.replace(/[시군구]$/, "") : name);

// 지역 이름(예: '부산 해운대구', '서울', '전남 순천시') 또는 지역코드 → { code, name }.
// 시도 이름이 앞에 있어야 한다. '중구'처럼 여러 시도에 있는 이름을 헷갈리지 않기 위해서다.
export async function resolveArea(text: string) {
  const raw = text.trim();
  if (isAreaCode(raw)) return { code: raw, name: await areaName(raw) };
  const query = squash(raw).replace(/(전체|전역)$/, "");
  const sidos = await areaList();
  // 긴 이름부터 맞춰 '광주광역시'를 '광주'보다 먼저 잡는다.
  const names = sidos
    .flatMap((sido) => [sido.name, ...(SIDO_ALIASES[sido.name] ?? [])].map((name) => ({ sido, name })))
    .sort((a, b) => b.name.length - a.name.length);
  const hit = names.find(({ name }) => query.startsWith(name));
  if (!hit) {
    throw new RangeError(
      `'${raw}' 지역을 찾지 못했습니다. 시도 이름을 앞에 넣어 다시 조회하세요(예: 부산 해운대구). 시도: ${sidos.map((sido) => sido.name).join(", ")}`,
    );
  }
  const rest = query.slice(hit.name.length);
  if (!rest) return { code: hit.sido.code, name: await areaName(hit.sido.code) };
  const siguns = await areaList(hit.sido.code);
  const sigunNames = siguns.map((area) => ({ area, name: squash(area.name) }));
  // 이름이 '광주 북구'처럼 앞에 다른 말이 붙어 와도 끝이 하나만 맞으면 그 시군구로 본다.
  const endings = sigunNames.filter(({ name }) => name.endsWith(rest));
  const sigun =
    sigunNames.find(({ name }) => name === rest)?.area ??
    sigunNames.find(({ name }) => stem(name) === stem(rest))?.area ??
    [...sigunNames].sort((a, b) => b.name.length - a.name.length).find(({ name }) => rest.startsWith(name))?.area ??
    (rest.length >= 2 && endings.length === 1 ? endings[0].area : undefined);
  if (!sigun) {
    throw new RangeError(
      `${hit.sido.name}에서 '${rest}'을 찾지 못했습니다. ${hit.sido.name}의 시군구: ${siguns.map((area) => area.name).join(", ")}`,
    );
  }
  return { code: sigun.code, name: await areaName(sigun.code) };
}

// 상호로 주유소 찾기. 오피넷은 이름 일부로도 찾아 준다. 가격은 없어서 get_station_detail로 따로 본다.
export async function searchStations(name: string, area: string | null, count = 5) {
  // '서하남주유소'처럼 붙여 써도 찾도록 끝의 '주유소'를 뗀다.
  const osnm = name.trim().replace(/\s*주유소$/, "") || name.trim();
  if (osnm.length < 2) throw new RangeError("주유소 이름은 두 글자 이상 넣어 주세요.");
  const query: Record<string, string> = { osnm };
  if (area) query.area = area.slice(0, 2);
  const { body, fetchedAt } = await fetchOpinetTimed("searchByName", query);
  const found = rows(body).map((row) => ({
    id: String(row.UNI_ID),
    name: String(row.OS_NM),
    brand: brandName(row.POLL_DIV_CO ?? row.POLL_DIV_CD),
    address: String(row.NEW_ADR || row.VAN_ADR || "").replace(/\s+/g, " "),
  }));
  return {
    query: osnm,
    area: area ? await areaName(area.slice(0, 2)) : "전국",
    fetchedAtKst: kstTime(fetchedAt),
    total: found.length,
    stations: found.slice(0, count),
    note: found.length > count ? "더 있습니다. 지역을 함께 말하면 좁혀 찾을 수 있습니다." : null,
  };
}

// 영수증에 적힌 주유소 이름으로 오피넷 주유소 하나를 찾는다(단골 점검). 이름이 꼭 같은 곳, 없으면 한쪽이 다른 쪽을 품는 곳이
// 한 곳뿐일 때 그곳, 그것도 없고 결과가 한 곳이면 그곳. 여러 곳에 걸리면 아무 곳이나 고르지 않는다.
export async function findStationByName(name: string, area: string | null) {
  const query = searchName(name);
  if (query.length < 2) return null;
  const { stations, total } = await searchStations(query, area, 20);
  const similar = stations.filter((station) => sameStation(name, station.name));
  const match =
    stations.find((station) => coreName(station.name) === coreName(name)) ??
    (similar.length === 1 ? similar[0] : null) ??
    (similar.length === 0 && total === 1 ? stations[0] : null);
  return match ? { id: match.id, name: match.name, brand: match.brand } : null;
}

const isAlttle = (brand: string) => brand.includes("알뜰");

// 이 주유소가 동네에서 싼 편인지: 시군구 평균과의 차이, 반경 5km 안에서 몇 번째로 싼지.
// 단골 점검과 '알뜰이 정말 싼지' 확인에 쓴다. 반경은 이 주유소에서 잰 직선 5km다.
export async function stationStanding(id: string, fuel: string, prefs: Prefs = NO_PREFS) {
  const prodcd = FUEL_CODES[fuel];
  if (!prodcd) throw new RangeError("지원하지 않는 유종입니다.");
  const [row] = rows(await fetchOpinet("detailById", { id }));
  if (!row) return { error: "주유소를 찾지 못했습니다." };
  const priceRow = ((row.OIL_PRICE as unknown as Row[] | undefined) ?? []).find((item) => String(item.PRODCD) === prodcd);
  const price = Number(priceRow?.PRICE);
  if (!priceRow || !(price > 0)) return { error: `${String(row.OS_NM)}에는 ${fuel} 가격이 없습니다.` };
  const brand = brandName(row.POLL_DIV_CO);
  const paidPrice = effectivePrice(price, brand, prefs.discounts);
  const sigun = String(row.SIGUNCD ?? "");
  const x = Number(row.GIS_X_COOR);
  const y = Number(row.GIS_Y_COOR);

  let areaAverage: { area: string; averageWon: number; diffWon: number } | null = null;
  if (/^\d{4}$/.test(sigun)) {
    const { body } = await fetchOpinetTimed("avgSigunPrice", { sido: sigun.slice(0, 2), sigun, prodcd }, 60 * 60 * 1000);
    const average = Number(rows(body).find((item) => String(item.PRODCD) === prodcd)?.PRICE);
    if (average > 0) {
      areaAverage = { area: await areaName(sigun), averageWon: Math.round(average * 10) / 10, diffWon: Math.round((price - average) * 10) / 10 };
    }
  }

  let nearby = null;
  if (isKatec(x, y)) {
    const { body, fetchedAt } = await fetchOpinetTimed("aroundAll", { x: String(x), y: String(y), radius: String(RADIUS_M), prodcd, sort: "1" });
    const list = aroundRows(body);
    const others = list.filter((item) => item.id !== id);
    const count = others.length + 1;
    const rank = others.filter((item) => item.price < price).length + 1;
    const quarter = Math.max(1, Math.floor(count / 4));
    // '더 싼 곳'은 뺀 상표를 거르고 할인 반영 가격으로 고른다. 순위(rank)는 오피넷 가격 그대로다.
    const options = withPrefs(others, prefs).stations;
    const cheapest = [...options].sort((a, b) => a.paidPrice - b.paidPrice || a.distanceM - b.distanceM)[0] ?? null;
    nearby = {
      radiusKm: RADIUS_M / 1000,
      fetchedAtKst: kstTime(fetchedAt),
      count,
      rank,
      position: rank <= quarter ? "싼 쪽 4분의 1 안" : rank > count - quarter ? "비싼 쪽 4분의 1 안" : "중간",
      isCheapest: rank === 1,
      // 이 주유소보다 싼 곳 가운데 가장 싼 곳(이 주유소에서 잰 직선거리)
      cheaperOption:
        cheapest && cheapest.paidPrice < paidPrice
          ? {
              id: cheapest.id,
              name: cheapest.name,
              brand: cheapest.brand,
              price: cheapest.price,
              discountWon: cheapest.discountWon,
              paidPrice: cheapest.paidPrice,
              distanceKm: toKm(cheapest.distanceM),
              cheaperByWon: paidPrice - cheapest.paidPrice,
            }
          : null,
    };
  }

  return {
    station: {
      id: String(row.UNI_ID),
      name: String(row.OS_NM),
      brand,
      alttle: isAlttle(brand),
      goodStation: row.GOOD_YN === "Y",
      fuel,
      price,
      discountWon: price - paidPrice,
      paidPrice,
      updatedAt: tradeTime(priceRow.TRADE_DT, priceRow.TRADE_TM),
    },
    areaAverage,
    nearby,
    note: "가격은 오피넷에 보고된 값이라 현장과 다를 수 있습니다. 순위는 이 주유소에서 직선 5km 안의 주유소끼리 비교한 것입니다.",
  };
}

// 지역 최저가. 내 할인이나 뺀 상표가 있으면 10곳을 받아 거르고 할인 반영 가격 순으로 count곳을 고른다.
export async function findCheapest(fuel: string, area: string, count = 5, prefs: Prefs = NO_PREFS) {
  const prodcd = FUEL_CODES[fuel];
  if (!prodcd || !isAreaCode(area)) {
    throw new RangeError("지원하지 않는 유종 또는 지역입니다.");
  }
  const name = await areaName(area);
  const personal = prefs.discounts.length > 0 || prefs.excludeBrands.length > 0;
  const { body, fetchedAt } = await fetchOpinetTimed("lowTop10", { prodcd, area, cnt: String(personal ? 10 : count) });
  const { stations, excludedCount } = withPrefs(
    rows(body).map((row) => ({
      id: String(row.UNI_ID),
      name: String(row.OS_NM),
      brand: brandName(row.POLL_DIV_CD),
      price: Number(row.PRICE),
      address: String(row.NEW_ADR || row.VAN_ADR || ""),
    })),
    prefs,
  );
  return {
    fuel,
    area: name,
    // 최저가 API에는 가격별 기준 시각이 없어, 오피넷에서 조회한 시각을 따로 준다(상세 정보의 기준 시각과 다름).
    fetchedAt,
    fetchedAtKst: kstTime(fetchedAt),
    excludedCount,
    stations: stations.sort((a, b) => a.paidPrice - b.paidPrice).slice(0, count),
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
export { DEFAULT_KMPL };
const RADIUS_M = 5000; // 오피넷 반경 조회의 최대값

// 출발 위치: 울주군 읍면 키(PLACES)나 시군구 코드(시군구청, AREA_PLACES), 또는 이용자 위치(이름과 KATEC 좌표).
export type Origin = string | { name: string; x: number; y: number };

export function resolveOrigin(origin: Origin) {
  if (typeof origin === "string") return placeAt(origin);
  return origin.name && isKatec(origin.x, origin.y) ? origin : null;
}

function aroundRows(body: unknown) {
  return rows(body)
    .map((row) => ({
      id: String(row.UNI_ID),
      name: String(row.OS_NM),
      brand: brandName(row.POLL_DIV_CD),
      price: Number(row.PRICE),
      distanceM: Number(row.DISTANCE),
    }))
    .filter((station) => station.price > 0 && Number.isFinite(station.distanceM));
}

const toKm = (meters: number) => Math.round(meters / 100) / 10;

// 실질비용 한 곳: 넣는 기름값 + 출발 위치에서 오가는 연료비(직선 왕복). 추천 목록과 지도가 같은 식을 쓴다.
function tripCost(paidPrice: number, distanceM: number, liters: number, kmpl: number) {
  const fillWon = Math.round(paidPrice * liters);
  const tripWon = Math.round(((2 * distanceM) / 1000 / kmpl) * paidPrice);
  return { fillWon, tripWon, totalWon: fillWon + tripWon };
}

// 내 할인과 뺀 상표 반영: 뺀 상표는 거르고(거른 수를 남긴다), 오피넷 가격(price)은 그대로 둔 채
// 할인액(discountWon)과 할인 반영 가격(paidPrice)을 더한다. 순위는 paidPrice로 매긴다.
function withPrefs<T extends { brand: string; price: number }>(list: T[], prefs: Prefs) {
  const kept = list.filter((station) => !isExcluded(station.brand, prefs.excludeBrands));
  return {
    stations: kept.map((station) => {
      const paidPrice = effectivePrice(station.price, station.brand, prefs.discounts);
      return { ...station, discountWon: station.price - paidPrice, paidPrice };
    }),
    excludedCount: list.length - kept.length,
  };
}

// 좌표가 속한 시군구. 오피넷에는 좌표로 지역을 찾는 기능이 없어, 반경 5km 안에서 가장 가까운 주유소의
// 시군구 코드(상세 정보의 SIGUNCD)로 정한다. 시군구 경계 근처에서는 옆 시군구가 나올 수 있다.
export async function areaAt(x: number, y: number) {
  if (!isKatec(x, y)) throw new RangeError("위치가 올바르지 않습니다.");
  const { body } = await fetchOpinetTimed("aroundAll", {
    x: String(x),
    y: String(y),
    radius: String(RADIUS_M),
    prodcd: FUEL_CODES.휘발유,
    sort: "2",
  });
  const nearest = aroundRows(body).sort((a, b) => a.distanceM - b.distanceM)[0];
  if (!nearest) return null;
  const [row] = rows(await fetchOpinet("detailById", { id: nearest.id }));
  const code = String(row?.SIGUNCD ?? "");
  if (!/^\d{4}$/.test(code)) return null;
  return { code, name: await areaName(code) };
}

// 내 위치 반경 5km 안에서 가격이 낮은 순으로 최대 5곳.
export async function findNearby(fuel: string, origin: Origin, count = 5, prefs: Prefs = NO_PREFS) {
  const prodcd = FUEL_CODES[fuel];
  const place = resolveOrigin(origin);
  if (!prodcd || !place) {
    throw new RangeError("지원하지 않는 유종 또는 위치입니다.");
  }
  const { body, fetchedAt } = await fetchOpinetTimed("aroundAll", {
    x: String(place.x),
    y: String(place.y),
    radius: String(RADIUS_M),
    prodcd,
    sort: "1",
  });
  const picked = withPrefs(aroundRows(body), prefs);
  return {
    fuel,
    place: place.name,
    radiusKm: RADIUS_M / 1000,
    fetchedAt,
    fetchedAtKst: kstTime(fetchedAt),
    distanceNote: "거리는 직선거리라 실제 도로는 더 깁니다.",
    excludedCount: picked.excludedCount,
    stations: picked.stations
      .sort((a, b) => a.paidPrice - b.paidPrice || a.distanceM - b.distanceM)
      .slice(0, count)
      .map(({ distanceM, ...station }) => ({ ...station, distanceKm: toKm(distanceM) })),
  };
}

// 실질비용: 기름값(가격 × 주유량)에 출발 위치에서 그 주유소까지 오가는 연료비를 더한 값.
// 거리는 오피넷이 주는 직선거리라 실제 도로보다 짧다. 그래서 오가는 연료비는 적게 잡힌 값이다.
// 금액(5만원어치)은 미리 리터로 바꿔(fill) 받는다. 같은 양을 넣을 때 어디가 덜 드는지 비교한다.
export async function findByTotalCost(
  fuel: string,
  origin: Origin,
  fill: Fill = litersFill(DEFAULT_LITERS),
  kmpl = DEFAULT_KMPL,
  prefs: Prefs = NO_PREFS,
) {
  const { liters } = fill;
  const prodcd = FUEL_CODES[fuel];
  const place = resolveOrigin(origin);
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
  // 내 할인이 있으면 넣는 기름도 오가는 기름도 할인 반영 가격으로 셈한다.
  const picked = withPrefs(aroundRows(body), prefs);
  const all = picked.stations.map(({ distanceM, ...station }) => ({
    ...station,
    distanceKm: toKm(distanceM),
    ...tripCost(station.paidPrice, distanceM, liters, kmpl),
  }));

  const base = {
    fuel,
    place: place.name,
    liters,
    fill,
    kmpl,
    radiusKm: RADIUS_M / 1000,
    fetchedAt,
    fetchedAtKst: kstTime(fetchedAt),
    distanceNote: "거리는 직선거리라 실제 도로는 더 깁니다.",
    excludedCount: picked.excludedCount,
  };
  if (all.length === 0) {
    return { ...base, stations: [], cheapest: null, nearest: null, extraForCheapestWon: 0, breakEvenWonPerKm: null };
  }

  const byTotal = [...all].sort((a, b) => a.totalWon - b.totalWon || a.distanceKm - b.distanceKm);
  const cheapest = [...all].sort((a, b) => a.paidPrice - b.paidPrice || a.distanceKm - b.distanceKm)[0];
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
    breakEvenWonPerKm: Math.round(((2 / kmpl) * best.paidPrice) / liters),
  };
}

// 지도: 출발 위치 반경 5km의 모든 주유소를 위경도, 할인 반영 가격, 실질비용과 함께 준다.
// 반경 조회 요청이 거리까지 고려한 추천과 같아 오피넷 캐시를 함께 쓴다. 가격 낮은 순으로 정렬한다.
export async function mapStations(
  fuel: string,
  origin: Origin,
  fill: Fill = litersFill(DEFAULT_LITERS),
  kmpl = DEFAULT_KMPL,
  prefs: Prefs = NO_PREFS,
) {
  const { liters } = fill;
  const prodcd = FUEL_CODES[fuel];
  const place = resolveOrigin(origin);
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
  const coords = new Map(rows(body).map((row) => [String(row.UNI_ID), { x: Number(row.GIS_X_COOR), y: Number(row.GIS_Y_COOR) }]));
  const picked = withPrefs(aroundRows(body), prefs);
  const stations = picked.stations
    .flatMap(({ distanceM, ...station }) => {
      const at = coords.get(station.id);
      if (!at || !isKatec(at.x, at.y)) return [];
      return [{ ...station, distanceKm: toKm(distanceM), ...fromKatec(at.x, at.y), ...tripCost(station.paidPrice, distanceM, liters, kmpl) }];
    })
    .sort((a, b) => a.paidPrice - b.paidPrice || a.distanceKm - b.distanceKm);
  const best = [...stations].sort((a, b) => a.totalWon - b.totalWon || a.distanceKm - b.distanceKm)[0];

  return {
    fuel,
    place: place.name,
    origin: fromKatec(place.x, place.y),
    liters,
    fill,
    kmpl,
    radiusKm: RADIUS_M / 1000,
    fetchedAt,
    fetchedAtKst: kstTime(fetchedAt),
    distanceNote: "거리는 직선거리라 실제 도로는 더 깁니다.",
    excludedCount: picked.excludedCount,
    cheapestId: stations[0]?.id ?? null,
    bestTotalId: best?.id ?? null,
    minPrice: stations[0]?.paidPrice ?? null,
    maxPrice: stations.at(-1)?.paidPrice ?? null,
    stations,
  };
}

// 출퇴근 길(데모): 집과 회사에서 반경 5km를 한 번씩 조회해, 두 곳 모두에 나온 주유소를 '집까지 + 회사까지' 직선거리가
// 짧은 순으로 고른다. 겹치는 곳이 없으면 집 근처와 회사 근처에서 할인 반영 가격이 가장 낮은 곳을 하나씩 준다.
export async function findCommute(fuel: string, home: Origin, work: Origin, prefs: Prefs = NO_PREFS) {
  const prodcd = FUEL_CODES[fuel];
  const homePlace = resolveOrigin(home);
  const workPlace = resolveOrigin(work);
  if (!prodcd || !homePlace || !workPlace) {
    throw new RangeError("지원하지 않는 유종이거나 집·회사 위치가 올바르지 않습니다.");
  }
  const around = (place: { x: number; y: number }) =>
    fetchOpinetTimed("aroundAll", { x: String(place.x), y: String(place.y), radius: String(RADIUS_M), prodcd, sort: "1" });
  const [atHome, atWork] = await Promise.all([around(homePlace), around(workPlace)]);
  const homeRows = aroundRows(atHome.body);
  const workRows = aroundRows(atWork.body);
  const excluded = new Set([...homeRows, ...workRows].filter((s) => isExcluded(s.brand, prefs.excludeBrands)).map((s) => s.id));
  const homeList = withPrefs(homeRows, prefs).stations;
  const workList = withPrefs(workRows, prefs).stations;
  const workById = new Map(workList.map((station) => [station.id, station]));
  type Picked = (typeof homeList)[number];
  const shape = (station: Picked, homeM: number | null, workM: number | null) => ({
    id: station.id,
    name: station.name,
    brand: station.brand,
    price: station.price,
    discountWon: station.discountWon,
    paidPrice: station.paidPrice,
    homeKm: homeM === null ? null : toKm(homeM),
    workKm: workM === null ? null : toKm(workM),
  });
  const overlap = homeList
    .filter((station) => workById.has(station.id))
    .map((station) => ({ station, homeM: station.distanceM, workM: workById.get(station.id)!.distanceM }))
    .sort((a, b) => a.homeM + a.workM - (b.homeM + b.workM) || a.station.paidPrice - b.station.paidPrice)
    .slice(0, 5)
    .map(({ station, homeM, workM }) => shape(station, homeM, workM));
  const cheapestOf = (list: Picked[]) => [...list].sort((a, b) => a.paidPrice - b.paidPrice || a.distanceM - b.distanceM)[0] ?? null;
  const bestHome = overlap.length === 0 ? cheapestOf(homeList) : null;
  const bestWork = overlap.length === 0 ? cheapestOf(workList) : null;
  const fetchedAt = atHome.fetchedAt < atWork.fetchedAt ? atHome.fetchedAt : atWork.fetchedAt;
  return {
    fuel,
    home: homePlace.name,
    work: workPlace.name,
    radiusKm: RADIUS_M / 1000,
    fetchedAt,
    fetchedAtKst: kstTime(fetchedAt),
    excludedCount: excluded.size,
    overlap,
    nearHome: bestHome ? shape(bestHome, bestHome.distanceM, null) : null,
    nearWork: bestWork ? shape(bestWork, null, bestWork.distanceM) : null,
    distanceNote: "거리는 직선거리라 실제 길은 더 길 수 있습니다.",
  };
}

const BIG_GAP_WON = 100;

// 주유소 점검: 공개 정보(품질인증, 착한주유소, 가격 보고일, 주변 가격)와 내 영수증을 맞춰 본다.
// 의심을 단정하지 않는다. 확인해 볼 만한 점만 알려 준다.
export async function stationTrust(id: string, fuel: string, ledger: LedgerEntry[], today: string) {
  const standing = await stationStanding(id, fuel);
  if ("error" in standing) return standing;
  const [row] = rows(await fetchOpinet("detailById", { id }));
  const priceRow = ((row?.OIL_PRICE as unknown as Row[] | undefined) ?? []).find(
    (item) => String(item.PRODCD) === FUEL_CODES[fuel],
  );
  const changedDt = String(priceRow?.TRADE_DT ?? "");
  const priceChangedOn = /^\d{8}$/.test(changedDt)
    ? `${changedDt.slice(0, 4)}-${changedDt.slice(4, 6)}-${changedDt.slice(6, 8)}`
    : null;
  const { station, areaAverage, nearby } = standing;

  // 내 영수증 가운데 이 주유소 것. 가격을 마지막으로 바꾼 날 뒤의 영수증만 지금 보고 가격과 비교할 수 있다.
  const receipts = ledger
    .filter((entry) => entry.stationName && sameStation(entry.stationName, station.name))
    .map((entry) => {
      const base = { date: entry.date, liters: entry.liters, receiptPricePerLiter: entry.pricePerLiter };
      if (entry.pricePerLiter === null) return { ...base, comparable: false, reason: "영수증에서 단가를 읽지 못함" };
      if (!priceChangedOn || entry.date <= priceChangedOn) {
        return { ...base, comparable: false, reason: "그 뒤에 보고 가격이 바뀌어 그때 보고 가격을 알 수 없음" };
      }
      return {
        ...base,
        comparable: true,
        reportedPrice: station.price,
        // +면 영수증 단가가 보고 가격보다 비쌈
        diffWon: entry.pricePerLiter - station.price,
      };
    });
  const higher = receipts.filter((item) => "diffWon" in item && (item.diffWon ?? 0) > 0);

  const checks = [
    {
      item: "석유관리원 품질인증",
      ok: row?.KPETRO_YN === "Y",
      result: row?.KPETRO_YN === "Y" ? "인증 주유소" : "인증 주유소 아님(인증이 없다고 품질이 나쁘다는 뜻은 아님)",
    },
    { item: "착한주유소", ok: station.goodStation, result: station.goodStation ? "지정됨" : "지정 안 됨" },
    {
      item: "가격 보고",
      ok: priceChangedOn !== null,
      result: priceChangedOn ? `${priceChangedOn}에 마지막으로 바꿔 보고` : "보고일 없음",
    },
  ];
  if (areaAverage) {
    const gap = areaAverage.diffWon;
    checks.push({
      item: "시군구 평균과 비교",
      ok: Math.abs(gap) < BIG_GAP_WON,
      result:
        gap <= -BIG_GAP_WON
          ? `평균보다 ${BIG_GAP_WON}원 넘게 쌈. 현장 가격과 영수증 단가를 확인해 볼 만함`
          : gap >= BIG_GAP_WON
            ? `평균보다 ${BIG_GAP_WON}원 넘게 비쌈`
            : `평균과 ${BIG_GAP_WON}원 안쪽 차이`,
    });
  }
  if (receipts.length > 0) {
    checks.push({
      item: "내 영수증과 보고 가격",
      ok: higher.length === 0,
      result:
        higher.length > 0
          ? `영수증 ${higher.length}장의 단가가 보고 가격보다 비쌌음. 셀프/일반 주유 차이나 할인 전 금액인지 확인해 볼 만함`
          : receipts.some((item) => item.comparable)
            ? "비교한 영수증 단가가 보고 가격보다 비싸지 않음"
            : "영수증은 있지만 비교할 수 있는 것이 없음",
    });
  }

  return {
    station: {
      ...station,
      qualityCertified: row?.KPETRO_YN === "Y",
      priceChangedOn,
      daysSincePriceChange: priceChangedOn ? Math.round((Date.parse(today) - Date.parse(priceChangedOn)) / 86_400_000) : null,
    },
    areaAverage,
    nearby: nearby && { count: nearby.count, rank: nearby.rank, position: nearby.position },
    checks,
    myReceipts: { matched: receipts.length, items: receipts.slice(-5) },
    note:
      "공개된 정보와 내 영수증만 맞춰 본 결과이며 주유소의 잘못을 판단한 것이 아닙니다. 가짜석유 판매 같은 불법행위로 적발된 주유소는 오피넷의 불법행위 공표 메뉴에서 따로 확인할 수 있습니다.",
  };
}

const UREA_CACHE_MS = 60 * 60 * 1000; // 요소수 정보는 하루 네 번(7·13·18·24시) 바뀐다
const UREA_MAX_KM = 30; // 위치로 찾을 때 이보다 먼 곳은 권하지 않는다

// 요소수 재고가 있는 주유소. 시도 단위로 받아, 시군구로 좁히거나 출발 위치에서 가까운 순으로 고른다.
export async function findUrea(sido: string, sigunName: string | null, origin: Origin | null, count = 5) {
  if (!/^\d{2}$/.test(sido)) throw new RangeError("시도 코드는 2자리 숫자입니다.");
  const place = origin === null ? null : resolveOrigin(origin);
  if (origin !== null && !place) throw new RangeError("출발 위치가 올바르지 않습니다.");
  const { body, fetchedAt } = await fetchOpinetTimed("ureaPrice", { area: sido }, UREA_CACHE_MS);
  const town = sigunName ? squash(sigunName.split(" ").at(-1) ?? "") : "";
  const all = rows(body).map((row) => {
    const x = Number(row.GIS_X_COOR);
    const y = Number(row.GIS_Y_COOR);
    const price = Number(row.PRICE);
    return {
      id: String(row.UNI_ID),
      name: String(row.OS_NM),
      address: String(row.ADR ?? "").replace(/\s+/g, " "),
      phone: String(row.TEL ?? ""),
      inStock: row.STOCK_YN === "Y",
      pricePerLiter: price > 0 ? price : null,
      updatedAt: tradeTime(row.TRADE_DT, row.TRADE_TM),
      distanceKm: place && isKatec(x, y) ? toKm(Math.hypot(x - place.x, y - place.y)) : null,
    };
  });
  const inArea = town ? all.filter((station) => squash(station.address).includes(town)) : all;
  const inStock = inArea.filter((station) => station.inStock);
  const sorted = place
    ? inStock
        .filter((station) => station.distanceKm !== null && station.distanceKm <= UREA_MAX_KM)
        .sort((a, b) => a.distanceKm! - b.distanceKm!)
    : inStock.sort((a, b) => (a.pricePerLiter ?? Infinity) - (b.pricePerLiter ?? Infinity));
  return {
    area: sigunName ?? (await areaName(sido)),
    from: place?.name ?? null,
    sortedBy: place ? `출발 위치에서 직선 ${UREA_MAX_KM}km 안, 가까운 순` : "가격 낮은 순",
    fetchedAtKst: kstTime(fetchedAt),
    stationsReported: inArea.length,
    inStockCount: inStock.length,
    stations: sorted.slice(0, count),
    note: "요소수 재고와 가격(원/L)은 주유소가 오피넷에 보고한 값이라 하루 네 번(7·13·18·24시) 바뀝니다. 가기 전에 전화로 재고를 확인하세요. 거리는 직선거리입니다.",
  };
}
