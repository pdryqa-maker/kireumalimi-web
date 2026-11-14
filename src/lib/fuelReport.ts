// 내 주유 월간 리포트. 장부(영수증·주유 기록)로 한 달 동안 넣은 양, 쓴 돈, 추정 주행거리를 셈하고,
// 단가가 있는 주유는 그날 우리 시도 평균 판매가(오피넷 날짜별 시도 평균)와 비교한다.
// 주행거리는 계기판 값이 아니라 넣은 양 × 연비로 추정한 값이다.
import { todayKst } from "./fillForecast";
import { paidWon, previousMonth, totals } from "./fillTotals";
import type { LedgerEntry } from "./ledger";
import { fetchOpinetTimed } from "./opinet";
import { areaName, FUEL_CODES, rows } from "./stations";

const DAY_MS = 86_400_000;
const PAST_CACHE_MS = 24 * 60 * 60 * 1000; // 지난 날짜의 평균은 바뀌지 않는다
const RECENT_CACHE_MS = 60 * 60 * 1000; // 최근 이틀은 평균이 아직 안 나왔을 수 있어 1시간만 재사용한다
const FALLBACK_DAYS = 3; // 그날 평균이 없으면 이 일수 안의 가장 가까운 지난 날 평균을 쓴다
const MAX_AVERAGE_CALLS = 6; // 한 번에 7일씩 받으므로 한 달은 다섯 번이면 된다
const DEFAULT_SIDO = "18"; // 지역을 넣지 않은 이용자는 울산 기준

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const compact = (date: string) => date.replaceAll("-", "");
const shiftDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const monthLabel = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;

// 날짜별 시도 평균 판매가. 한 번 부르면 그 날짜까지 7일치(모든 유종)가 온다.
// 가장 최근 날은 평균이 아직 없어 빈 응답이 올 수 있다. 그래서 받은 날짜 범위만 다 받은 것으로 치고,
// 빈 응답이면 그 날짜만 건너뛰어 다른 날짜는 따로 부른다.
async function dailyAverages(sido: string, prodcd: string, dates: string[], today: string) {
  const prices = new Map<string, number>();
  const done = new Set<string>();
  const wanted = [...new Set(dates)].sort().reverse();
  const recentFrom = shiftDays(today, -2);
  let calls = 0;
  for (const date of wanted) {
    if (prices.has(date) || done.has(date) || calls >= MAX_AVERAGE_CALLS) continue;
    calls++;
    done.add(date);
    try {
      const { body } = await fetchOpinetTimed(
        "dateAreaAvgRecentPrice",
        { area: sido, date: compact(date) },
        date >= recentFrom ? RECENT_CACHE_MS : PAST_CACHE_MS,
      );
      const received: string[] = [];
      for (const row of rows(body)) {
        const day = String(row.DATE ?? "");
        const price = Number(row.PRICE);
        if (String(row.PRODCD) === prodcd && /^\d{8}$/.test(day) && price > 0) {
          const iso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
          prices.set(iso, price);
          received.push(iso);
        }
      }
      // 받은 범위 안의 날짜는 다시 부르지 않는다(값이 없으면 그날은 평균이 없는 날이다).
      const first = received.sort()[0];
      if (first) wanted.filter((day) => day >= first && day <= date).forEach((day) => done.add(day));
      // 최근 날짜가 비어 있으면 하루 앞 날짜로 한 번 더 불러, 가장 가까운 지난 날 평균이라도 쓴다.
      if (!first && date >= recentFrom && !wanted.includes(shiftDays(date, -1))) wanted.push(shiftDays(date, -1));
    } catch {
      // 평균을 못 받은 날은 비교하지 않는다(리포트의 나머지는 그대로 보여 준다).
    }
  }
  return prices;
}

// 그날 평균, 없으면 3일 안의 가장 가까운 지난 날 평균. 쓴 날짜도 함께 돌려준다.
function averageOn(prices: Map<string, number>, date: string) {
  for (let back = 0; back <= FALLBACK_DAYS; back++) {
    const day = shiftDays(date, -back);
    const price = prices.get(day);
    if (price && price > 0) return { price, day };
  }
  return null;
}

type ReportOptions = { fuel: string; kmpl: number; area: string | null; month?: string; today?: string };

export async function fuelReport(ledger: LedgerEntry[], { fuel, kmpl, area, month, today = todayKst() }: ReportOptions) {
  const prodcd = FUEL_CODES[fuel];
  if (!prodcd) throw new RangeError("지원하지 않는 유종입니다.");
  const thisMonth = today.slice(0, 7);
  const target = month || thisMonth;
  const oldest = `${Number(today.slice(0, 4)) - 1}${today.slice(4, 7)}`;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(target) || target > thisMonth || target < oldest) {
    throw new RangeError("리포트는 최근 12개월 안의 달(YYYY-MM)만 볼 수 있습니다.");
  }
  const sido = area?.slice(0, 2) || DEFAULT_SIDO;
  const entries = ledger.filter((entry) => entry.date.startsWith(target));
  const before = ledger.filter((entry) => entry.date.startsWith(previousMonth(target)));
  const sum = totals(entries, kmpl);
  const prev = before.length > 0 ? totals(before, kmpl) : null;

  const priced = entries.filter((entry) => entry.pricePerLiter !== null && entry.liters !== null);
  const averages = priced.length > 0 ? await dailyAverages(sido, prodcd, priced.map((entry) => entry.date), today) : new Map<string, number>();
  const compared = priced
    .map((entry) => {
      const found = averageOn(averages, entry.date);
      if (!found) return null;
      const average = found.price;
      return {
        date: entry.date,
        stationName: entry.stationName,
        pricePerLiter: entry.pricePerLiter!,
        areaAverageWon: round1(average),
        // 비교한 평균의 날짜. 그날 평균이 아직 없으면 가장 가까운 지난 날이다.
        averageDate: found.day,
        // +면 그날 평균보다 비싸게, -면 싸게 넣음
        diffWon: round1(entry.pricePerLiter! - average),
        // +면 평균 가격으로 넣었을 때보다 아낀 돈, -면 더 쓴 돈
        savedWon: Math.round((average - entry.pricePerLiter!) * entry.liters!),
      };
    })
    .filter((item) => item !== null);

  const gaps = entries.slice(1).map((entry, index) => (Date.parse(entry.date) - Date.parse(entries[index].date)) / DAY_MS);
  const stationCounts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.stationName) stationCounts.set(entry.stationName, (stationCounts.get(entry.stationName) ?? 0) + 1);
  }

  return {
    month: target,
    monthLabel: monthLabel(target),
    fuel,
    kmpl,
    ...sum,
    avgGapDays: gaps.length > 0 ? round1(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    vsArea:
      compared.length > 0
        ? {
            area: (await areaName(sido)).replace(/ 전체$/, ""),
            comparedFills: compared.length,
            savedWon: compared.reduce((total, item) => total + item.savedWon, 0),
            fills: compared,
          }
        : null,
    stations: [...stationCounts].map(([name, fills]) => ({ name, fills })).sort((a, b) => b.fills - a.fills).slice(0, 3),
    previous: prev
      ? {
          month: previousMonth(target),
          monthLabel: monthLabel(previousMonth(target)),
          fills: prev.fills,
          liters: prev.liters,
          litersUnknownFills: prev.litersUnknownFills,
          totalWon: prev.totalWon,
          estimatedKm: prev.estimatedKm,
          // 이번 달 - 지난달. 금액은 두 달 모두 금액을 다 알 때만 비교한다.
          // 리터는 두 달 모두 리터를 다 알 때만 비교한다.
          litersDiff: sum.litersUnknownFills === 0 && prev.litersUnknownFills === 0 ? round2(sum.liters - prev.liters) : null,
          wonDiff:
            sum.totalWon !== null && prev.totalWon !== null && sum.wonUnknownFills === 0 && prev.wonUnknownFills === 0
              ? sum.totalWon - prev.totalWon
              : null,
        }
      : null,
    entries: entries.map((entry) => ({ ...entry, paidWon: paidWon(entry) })),
    note:
      "주행거리는 넣은 양 × 연비로 추정한 값이고, 금액만 적은 주유(litersUnknownFills)는 넣은 양과 주행거리에서 빠집니다. 평균 비교는 그날 시도 평균 판매가(오피넷)와 영수증 단가를 비교한 것이고, 그날 평균이 아직 나오지 않았으면 가장 가까운 지난 날(3일 안) 평균을 씁니다(averageDate). 단가가 없는 주유는 빼고 셉니다.",
  };
}

export type FuelReport = Awaited<ReturnType<typeof fuelReport>>;
