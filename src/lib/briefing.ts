// 오늘의 기름 소식: 오피넷 평균 판매가(전국, 내 지역)와 어제보다 얼마나 움직였는지.
// 평균가는 하루에 여러 번 새로 매겨지므로 1시간 동안 재사용해 하루 조회 한도를 아낀다.
import { fetchOpinetTimed } from "@/lib/opinet";
import { areaName, FUEL_CODES, isAreaCode, kstTime, rows } from "@/lib/stations";

const AVERAGE_CACHE_MS = 60 * 60 * 1000;

export type Average = { price: number; diff: number };

function average(body: unknown, prodcd: string): Average | null {
  const row = rows(body).find((item) => String(item.PRODCD) === prodcd);
  const price = Number(row?.PRICE);
  const diff = Number(row?.DIFF);
  return row && price > 0 && Number.isFinite(diff) ? { price, diff } : null;
}

export async function fuelBriefing(fuel: string, area: string | null) {
  const prodcd = FUEL_CODES[fuel];
  if (!prodcd || (area !== null && !isAreaCode(area))) {
    throw new RangeError("지원하지 않는 유종 또는 지역입니다.");
  }
  const nationwide = await fetchOpinetTimed("avgAllPrice", {}, AVERAGE_CACHE_MS);
  let local: (Average & { area: string }) | null = null;
  if (area) {
    const query: Record<string, string> = area.length === 4 ? { sido: area.slice(0, 2), sigun: area, prodcd } : { sido: area, prodcd };
    const { body } = await fetchOpinetTimed(area.length === 4 ? "avgSigunPrice" : "avgSidoPrice", query, AVERAGE_CACHE_MS);
    const found = average(body, prodcd);
    if (found) local = { ...found, area: await areaName(area) };
  }
  const tradeDate = String(rows(nationwide.body)[0]?.TRADE_DT ?? "");
  return {
    fuel,
    // 평균가가 매겨진 날(오피넷 TRADE_DT)과 우리가 받아 온 시각
    date: /^\d{8}$/.test(tradeDate) ? `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6, 8)}` : null,
    fetchedAt: nationwide.fetchedAt,
    fetchedAtKst: kstTime(nationwide.fetchedAt),
    national: average(nationwide.body, prodcd),
    local,
  };
}

export type FuelBriefing = Awaited<ReturnType<typeof fuelBriefing>>;
