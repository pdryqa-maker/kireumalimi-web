// 내 주유 월간 리포트. 장부(영수증·주유 기록)로 한 달 동안 넣은 양, 쓴 돈, 추정 주행거리를 셈하고,
// 단가가 있는 주유는 그날 우리 시도 평균 판매가(오피넷 날짜별 시도 평균)와 비교한다.
// 주행거리는 계기판 값이 아니라 넣은 양 × 연비로 추정한 값이다.
import { todayKst } from "./fillForecast";
import type { LedgerEntry } from "./ledger";
import { fetchOpinetTimed } from "./opinet";
import { areaName, FUEL_CODES, rows } from "./stations";

const DAY_MS = 86_400_000;
const PAST_CACHE_MS = 24 * 60 * 60 * 1000; // 지난 날짜의 평균은 바뀌지 않는다
const MAX_AVERAGE_CALLS = 6; // 한 번에 7일씩 받으므로 한 달은 다섯 번이면 된다
const DEFAULT_SIDO = "18"; // 지역을 넣지 않은 이용자는 울산 기준

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const compact = (date: string) => date.replaceAll("-", "");
const shiftDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

function previousMonth(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
}

const monthLabel = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;

// 결제 금액이 없으면 단가 × 양으로 셈한다. 둘 다 없으면 모른다.
const paidWon = (entry: LedgerEntry) =>
  entry.totalWon ?? (entry.pricePerLiter ? Math.round(entry.pricePerLiter * entry.liters) : null);

function totals(entries: LedgerEntry[], kmpl: number) {
  const liters = round2(entries.reduce((sum, entry) => sum + entry.liters, 0));
  const paid = entries.filter((entry) => paidWon(entry) !== null);
  const totalWon = paid.reduce((sum, entry) => sum + paidWon(entry)!, 0);
  const paidLiters = paid.reduce((sum, entry) => sum + entry.liters, 0);
  return {
    fills: entries.length,
    liters,
    // 금액을 아는 주유만 더한 값. wonUnknownFills가 0보다 크면 실제로 쓴 돈은 이보다 많다.
    totalWon: paid.length > 0 ? totalWon : null,
    wonUnknownFills: entries.length - paid.length,
    avgPricePerLiter: paidLiters > 0 ? round1(totalWon / paidLiters) : null,
    estimatedKm: Math.round(liters * kmpl),
    wonPerKm: paidLiters > 0 ? round1(totalWon / (paidLiters * kmpl)) : null,
  };
}

// 날짜별 시도 평균 판매가. 한 번 부르면 그 날짜까지 7일치(모든 유종)가 온다.
async function dailyAverages(sido: string, prodcd: string, dates: string[]) {
  const prices = new Map<string, number>();
  const wanted = [...new Set(dates)].sort().reverse();
  let calls = 0;
  for (const date of wanted) {
    if (prices.has(date) || calls >= MAX_AVERAGE_CALLS) continue;
    calls++;
    try {
      const { body } = await fetchOpinetTimed("dateAreaAvgRecentPrice", { area: sido, date: compact(date) }, PAST_CACHE_MS);
      for (const row of rows(body)) {
        const day = String(row.DATE ?? "");
        const price = Number(row.PRICE);
        if (String(row.PRODCD) === prodcd && /^\d{8}$/.test(day) && price > 0) {
          prices.set(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`, price);
        }
      }
    } catch {
      // 평균을 못 받은 날은 비교하지 않는다(리포트의 나머지는 그대로 보여 준다).
    }
    // 이 호출로 받지 못한 날짜가 같은 7일 안에 있으면 다시 부르지 않는다.
    for (let back = 0; back < 7; back++) {
      const day = shiftDays(date, -back);
      if (!prices.has(day)) prices.set(day, Number.NaN);
    }
  }
  return prices;
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

  const priced = entries.filter((entry) => entry.pricePerLiter !== null);
  const averages = priced.length > 0 ? await dailyAverages(sido, prodcd, priced.map((entry) => entry.date)) : new Map<string, number>();
  const compared = priced
    .map((entry) => {
      const average = averages.get(entry.date) ?? Number.NaN;
      if (!(average > 0)) return null;
      return {
        date: entry.date,
        stationName: entry.stationName,
        pricePerLiter: entry.pricePerLiter!,
        areaAverageWon: round1(average),
        // +면 그날 평균보다 비싸게, -면 싸게 넣음
        diffWon: round1(entry.pricePerLiter! - average),
        // +면 평균 가격으로 넣었을 때보다 아낀 돈, -면 더 쓴 돈
        savedWon: Math.round((average - entry.pricePerLiter!) * entry.liters),
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
          totalWon: prev.totalWon,
          estimatedKm: prev.estimatedKm,
          // 이번 달 - 지난달. 금액은 두 달 모두 금액을 다 알 때만 비교한다.
          litersDiff: round2(sum.liters - prev.liters),
          wonDiff:
            sum.totalWon !== null && prev.totalWon !== null && sum.wonUnknownFills === 0 && prev.wonUnknownFills === 0
              ? sum.totalWon - prev.totalWon
              : null,
        }
      : null,
    entries: entries.map((entry) => ({ ...entry, paidWon: paidWon(entry) })),
    note:
      "주행거리는 넣은 양 × 연비로 추정한 값입니다. 평균 비교는 그날 시도 평균 판매가(오피넷)와 영수증 단가를 비교한 것이고, 단가가 없는 주유는 빼고 셉니다.",
  };
}

export type FuelReport = Awaited<ReturnType<typeof fuelReport>>;
