// 챗봇이 쓸 주유소 조회 기능. 화면의 결과 카드와 나중에 붙일 AI 도구가 함께 쓴다.
import { fetchOpinet, fetchOpinetTimed } from "@/lib/opinet";

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
