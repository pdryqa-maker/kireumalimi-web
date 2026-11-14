// 주유 장부의 합계. 서버의 월간 리포트와 브라우저의 내 기록 대시보드가 함께 쓴다.
// 그래서 서버 모듈(오피넷 등)을 import하지 않는다.
import { isLiters } from "./fillAmount";
import { MAX_RECORDS, RECORD_WON, type FillRecord } from "./fillForecast";
import type { LedgerEntry } from "./ledger";

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

export function previousMonth(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
}

// 결제 금액이 없으면 단가 × 양으로 셈한다. 둘 다 없으면 모른다.
export const paidWon = (entry: LedgerEntry) =>
  entry.totalWon ?? (entry.pricePerLiter && entry.liters !== null ? Math.round(entry.pricePerLiter * entry.liters) : null);

export function totals(entries: LedgerEntry[], kmpl: number) {
  const known = entries.filter((entry) => entry.liters !== null);
  const liters = round2(known.reduce((sum, entry) => sum + entry.liters!, 0));
  const paid = entries.filter((entry) => paidWon(entry) !== null);
  const totalWon = paid.reduce((sum, entry) => sum + paidWon(entry)!, 0);
  // 단가와 km당 연료비는 금액과 리터를 함께 아는 주유로만 셈한다.
  const both = paid.filter((entry) => entry.liters !== null);
  const bothWon = both.reduce((sum, entry) => sum + paidWon(entry)!, 0);
  const bothLiters = both.reduce((sum, entry) => sum + entry.liters!, 0);
  return {
    fills: entries.length,
    // 리터를 아는 주유만 더한 값. 금액만 적은 주유(litersUnknownFills)는 빠진다.
    liters,
    litersUnknownFills: entries.length - known.length,
    // 금액을 아는 주유만 더한 값. wonUnknownFills가 0보다 크면 실제로 쓴 돈은 이보다 많다.
    totalWon: paid.length > 0 ? totalWon : null,
    wonUnknownFills: entries.length - paid.length,
    avgPricePerLiter: bothLiters > 0 ? round1(bothWon / bothLiters) : null,
    estimatedKm: Math.round(liters * kmpl),
    wonPerKm: bothLiters > 0 ? round1(bothWon / (bothLiters * kmpl)) : null,
  };
}

// today(YYYY-MM-DD)의 달까지 count달. 오래된 달부터.
export function monthKeys(today: string, count: number): string[] {
  const keys = [today.slice(0, 7)];
  while (keys.length < count) keys.unshift(previousMonth(keys[0]));
  return keys;
}

export type MonthSpend = {
  month: string; // YYYY-MM
  won: number; // 금액을 아는 주유만 더한 값
  fills: number;
  wonUnknownFills: number;
  liters: number;
  // before: 가장 오래된 기록보다 앞선 달(기록 전). partial: 장부가 꽉 차서 앞쪽이 잘렸을 수 있는 가장 오래된 달.
  state: "before" | "partial" | "full";
};

// 달별 쓴 돈. capped는 브라우저 장부가 한도까지 찼는지(가장 오래된 달이 일부만 남았을 수 있다).
export function monthlySpend(entries: LedgerEntry[], today: string, count: number, capped: boolean): MonthSpend[] {
  const oldest = entries.reduce<string | null>((min, entry) => (min === null || entry.date < min ? entry.date : min), null);
  const oldestMonth = oldest?.slice(0, 7) ?? null;
  return monthKeys(today, count).map((month) => {
    const inMonth = entries.filter((entry) => entry.date.startsWith(month));
    const sum = totals(inMonth, 0);
    const state = oldestMonth === null || month < oldestMonth ? "before" : capped && month === oldestMonth ? "partial" : "full";
    return {
      month,
      won: sum.totalWon ?? 0,
      fills: sum.fills,
      wonUnknownFills: sum.wonUnknownFills,
      liters: sum.liters,
      state,
    };
  });
}

// 그래프 점 하나의 금액. 가장 많이 쓴 달의 온전한 점이 24개를 넘으면 2만원, 그래도 넘으면 5만원.
export const MAX_DOTS = 24;
export function dotUnit(maxWon: number): 10000 | 20000 | 50000 {
  if (Math.floor(maxWon / 10000) <= MAX_DOTS) return 10000;
  if (Math.floor(maxWon / 20000) <= MAX_DOTS) return 20000;
  return 50000;
}

// 다음 주유일 예보에 쓸 기록: 장부의 최근 5번. 금액은 결제 금액(없으면 양×단가), 양은 정수 리터로 맞춘다.
// 예보가 받지 않는 값(100만원 넘는 금액 등)은 비워 두고, 금액도 양도 없으면 뺀다.
export function forecastRecords(entries: LedgerEntry[]): FillRecord[] {
  return entries
    .slice(-MAX_RECORDS)
    .map((entry) => {
      const paid = paidWon(entry);
      const liters = entry.liters === null ? null : Math.round(entry.liters);
      return {
        date: entry.date,
        won: paid !== null && paid >= RECORD_WON.min && paid <= RECORD_WON.max ? paid : null,
        liters: liters !== null && isLiters(liters) ? liters : null,
      };
    })
    .filter((record) => record.won !== null || record.liters !== null);
}

// 그 달의 시도 평균 비교가 쓰는 기록(단가와 양이 있는 주유)의 지문. 바뀌지 않았으면 비교를 다시 받지 않는다.
export const monthFingerprint = (entries: LedgerEntry[], month: string) =>
  entries
    .filter((entry) => entry.date.startsWith(month) && entry.pricePerLiter !== null && entry.liters !== null)
    .map((entry) => `${entry.date}:${entry.liters}:${entry.pricePerLiter}`)
    .join(",");
