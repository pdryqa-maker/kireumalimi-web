// 개인 계산: 내 정보와 주유 장부로 다음 주유, 예상 비용, 유류세 일정, 이번 달 예상, 단골, 아낀 돈, 연비 추이를 셈한다.
// 내 기록 요약과 알림 문구가 같은 숫자를 쓰도록 한 곳에 둔다. AI도 오피넷도 부르지 않는다(평균가는 받아서 넘긴다).
import { monthDay, won } from "@/components/format";
import { bestDiscount, type Discount } from "./discounts";
import { amountName, wonName, type Amount, type Fill } from "./fillAmount";
import { addDays, daysBetween, forecastNextFill, MIN_RECORDS, notifyDay } from "./fillForecast";
import { forecastRecords, previousMonth, totals, vsAreaKey } from "./fillTotals";
import { measuredSpans } from "./fuelEconomy";
import type { LedgerEntry } from "./ledger";
import { FUEL_TAX_CUT, taxCutImpact } from "./policy";
import type { VsArea } from "./savedVsArea";
import { coreName } from "./stationName";

export const DAYS_PER_MONTH = 30;
const FAVORITE_DAYS = 90;
const TREND_SPANS = 6;

const later = (a: string, b: string) => (a > b ? a : b);
const sortedByDate = (entries: LedgerEntry[]) => [...entries].sort((a, b) => a.date.localeCompare(b.date));

// 다음 주유 계획. records: 최근 주유 간격의 평균, monthlyKm: 한 번 넣는 양 × 연비 ÷ 하루 주행거리.
export type FillPlan = {
  basis: "records" | "monthlyKm";
  gapDays: number;
  lastDate: string | null;
  nextDate: string;
  notifyOn: string;
  due: boolean;
  typicalWon: number | null; // 기록으로 셈한 평소 1회 금액
};

export function fillPlan({
  entries,
  monthlyKm,
  kmpl,
  fillLiters,
  today,
}: {
  entries: LedgerEntry[];
  monthlyKm: number | null;
  kmpl: number;
  fillLiters: number | null;
  today: string;
}): FillPlan | null {
  const records = forecastRecords(entries);
  if (records.length >= MIN_RECORDS) {
    try {
      const forecast = forecastNextFill(records, today);
      return {
        basis: "records",
        gapDays: forecast.avgGapDays,
        lastDate: forecast.lastDate,
        nextDate: forecast.nextDate,
        notifyOn: forecast.notifyOn,
        due: forecast.due,
        typicalWon: forecast.typicalWon,
      };
    } catch (problem) {
      if (!(problem instanceof RangeError)) throw problem;
      // 기록 사이가 너무 길거나 오래되면 한 달 주행거리로 셈한다.
    }
  }
  if (!monthlyKm || !fillLiters || !(fillLiters > 0)) return null;
  const gapDays = Math.max(1, Math.round((fillLiters * kmpl) / (monthlyKm / DAYS_PER_MONTH)));
  const lastDate = sortedByDate(entries).at(-1)?.date ?? null;
  const nextDate = addDays(lastDate ?? today, gapDays);
  return { basis: "monthlyKm", gapDays, lastDate, nextDate, notifyOn: notifyDay(nextDate, today), due: nextDate <= today, typicalWon: null };
}

// 내 지역 오늘 평균가(오피넷). 받지 못하면 null로 넘긴다.
export type AreaPrice = { date: string; fuel: string; area: string; areaName: string; price: number; scope: "local" | "national" };

// 한 번 넣을 때의 예상 비용. 금액으로 넣으면 그 금액이 비용이고, 가득이면 평균가로 셈한다.
// 평소 넣는 상표를 모르므로 할인은 가장 큰 것으로 셈한다.
export type FillCost = {
  kind: "won" | "full";
  won: number;
  liters: number;
  priceBasis: string | null;
  discount: Discount | null;
  discountSavedWon: number; // 할인으로 아끼는 돈(리터 × 리터당 할인)
};

export function fillCost({
  amount,
  fill,
  areaPrice,
  discounts,
}: {
  amount: Amount;
  fill: Pick<Fill, "liters"> | null;
  areaPrice: AreaPrice | null;
  discounts: Discount[];
}): FillCost | null {
  if (!fill) return null;
  const discount = bestDiscount(discounts);
  const off = discount?.wonPerLiter ?? 0;
  const discountSavedWon = Math.round(fill.liters * off);
  if (amount !== "full") {
    return { kind: "won", won: amount, liters: fill.liters, priceBasis: null, discount, discountSavedWon };
  }
  if (!areaPrice) return null;
  const won = Math.round((Math.max(0, areaPrice.price - off) * fill.liters) / 100) * 100;
  const priceBasis = areaPrice.scope === "national" ? "전국 평균가" : `${areaPrice.areaName} 평균가`;
  return { kind: "full", won, liters: fill.liters, priceBasis, discount, discountSavedWon };
}

export function costPhrase(cost: FillCost, amount: Amount) {
  if (cost.kind === "full") {
    const discount = cost.discount ? `, ${cost.discount.brand} 리터당 ${won(cost.discount.wonPerLiter)}원 할인 반영` : "";
    return `가득이면 약 ${wonName(cost.won)}(${cost.priceBasis} 기준${discount})`;
  }
  const discount = cost.discount
    ? ` · ${cost.discount.brand}에서 넣으면 할인으로 약 ${won(cost.discountSavedWon)}원 아껴요`
    : "";
  return `평소처럼 ${amountName(amount)}면 약 ${cost.liters}L${discount}`;
}

// 유류세 인하 일정: 종료까지 남은 날과 그 전에 넣을 횟수. 종료가 지났거나 대상 유종이 아니면 null.
export type TaxSchedule = {
  endsOn: string;
  daysLeft: number;
  fillsBefore: number | null;
  nextAfterEnd: boolean;
  maxExtraWon: number | null;
  wonPerLiter: number;
};

export function taxSchedule({
  fuel,
  plan,
  liters,
  today,
}: {
  fuel: string;
  plan: FillPlan | null;
  liters: number | null;
  today: string;
}): TaxSchedule | null {
  const { endsOn } = FUEL_TAX_CUT;
  if (today > endsOn) return null;
  const impact = taxCutImpact(fuel, liters);
  if ("error" in impact) return null;
  let fillsBefore: number | null = null;
  let nextAfterEnd = false;
  if (plan) {
    const first = later(plan.nextDate, today);
    nextAfterEnd = first > endsOn;
    fillsBefore = nextAfterEnd ? 0 : 1 + Math.floor(daysBetween(first, endsOn) / plan.gapDays);
  }
  return {
    endsOn,
    daysLeft: daysBetween(today, endsOn),
    fillsBefore,
    nextAfterEnd,
    maxExtraWon: impact.maxExtraWon,
    wonPerLiter: impact.wonPerLiter,
  };
}

export function taxLine(tax: TaxSchedule, fillLabel: string | null) {
  if (tax.nextAfterEnd) {
    const extra =
      fillLabel && tax.maxExtraWon !== null ? `${fillLabel}에 최대 ${won(tax.maxExtraWon)}원` : `리터당 최대 ${won(tax.wonPerLiter)}원`;
    return `다음 주유는 인하가 끝난 뒤예요. ${monthDay(tax.endsOn)} 전에 넣으면 ${extra} 덜 들어요`;
  }
  if (tax.fillsBefore === null) return `유류세 인하 끝나기까지 ${tax.daysLeft}일(${monthDay(tax.endsOn)}까지)`;
  return `유류세 인하 끝나기까지 ${tax.daysLeft}일 · 그 전에 약 ${tax.fillsBefore}번 더 넣어요`;
}

// 이번 달 예상 기름값: 이번 달 쓴 돈 + 남은 날 동안 넣을 횟수 × 평소 1회 금액.
export type MonthProjection = { month: string; spentWon: number; remainingFills: number; projectedWon: number; lastMonthWon: number | null };

const monthWon = (entries: LedgerEntry[], month: string) => {
  const inMonth = entries.filter((entry) => entry.date.startsWith(month));
  return inMonth.length > 0 ? (totals(inMonth, 0).totalWon ?? 0) : null;
};

export function monthProjection({
  entries,
  plan,
  perFillWon,
  today,
}: {
  entries: LedgerEntry[];
  plan: FillPlan | null;
  perFillWon: number | null;
  today: string;
}): MonthProjection | null {
  if (!plan || !perFillWon) return null;
  const month = today.slice(0, 7);
  let remainingFills = 0;
  for (let date = later(plan.nextDate, today); date.startsWith(month); date = addDays(date, plan.gapDays)) remainingFills++;
  const spentWon = monthWon(entries, month) ?? 0;
  return {
    month,
    spentWon,
    remainingFills,
    projectedWon: spentWon + remainingFills * perFillWon,
    lastMonthWon: monthWon(entries, previousMonth(month)),
  };
}

// 단골 주유소: 최근 90일에 2번 이상 간 곳 중 가장 많이 간 곳(같으면 최근에 간 곳). 없으면 마지막 주유소.
export function favoriteStation(entries: LedgerEntry[], today: string) {
  const named = sortedByDate(entries).filter((entry) => entry.stationName);
  if (named.length === 0) return null;
  const since = addDays(today, -FAVORITE_DAYS);
  const groups = new Map<string, { name: string; visits: number; lastDate: string }>();
  for (const entry of named.filter((item) => item.date >= since)) {
    const key = coreName(entry.stationName!);
    const group = groups.get(key);
    groups.set(key, { name: entry.stationName!, visits: (group?.visits ?? 0) + 1, lastDate: entry.date });
  }
  const best = [...groups.values()]
    .filter((group) => group.visits >= 2)
    .sort((a, b) => b.visits - a.visits || b.lastDate.localeCompare(a.lastDate))[0];
  if (best) return { name: best.name, visits: best.visits, basis: "frequent" as const };
  const last = named.at(-1)!;
  return { name: last.stationName!, visits: groups.get(coreName(last.stationName!))?.visits ?? 0, basis: "latest" as const };
}

// 한 달에 넣는 양(L): 최근 90일 장부로, 리터 기록이 없으면 한 달 주행거리 ÷ 연비.
export function monthlyLiters({
  entries,
  today,
  monthlyKm,
  kmpl,
}: {
  entries: LedgerEntry[];
  today: string;
  monthlyKm: number | null;
  kmpl: number;
}): { liters: number; basis: "records" | "monthlyKm" } | null {
  const since = addDays(today, -FAVORITE_DAYS);
  const recent = sortedByDate(entries).filter((entry) => entry.date >= since && entry.date <= today && entry.liters !== null);
  if (recent.length > 0) {
    const sum = recent.reduce((total, entry) => total + entry.liters!, 0);
    const days = Math.max(DAYS_PER_MONTH, daysBetween(recent[0].date, today));
    return { liters: Math.round((sum / days) * DAYS_PER_MONTH), basis: "records" };
  }
  return monthlyKm ? { liters: Math.round(monthlyKm / kmpl), basis: "monthlyKm" } : null;
}

// 올해 아낀 돈: 이미 받아 둔 달별 시도 평균 비교를 더한다. 이번 달은 오늘 받은 결과만 쓴다.
export function yearSavings({
  stored,
  entries,
  fuel,
  areaCode,
  today,
}: {
  stored: Record<string, VsArea>;
  entries: LedgerEntry[];
  fuel: string;
  areaCode: string;
  today: string;
}) {
  const thisMonth = today.slice(0, 7);
  let savedWon = 0;
  let checkedMonths = 0;
  let includesThisMonth = false;
  const uncheckedMonths: string[] = [];
  for (let mon = 1; mon <= Number(thisMonth.slice(5, 7)); mon++) {
    const month = `${thisMonth.slice(0, 4)}-${String(mon).padStart(2, "0")}`;
    const key = vsAreaKey(fuel, areaCode, entries, month);
    if (!key) continue;
    const saved = stored[month];
    const usable = saved?.fingerprint === key && (month < thisMonth || saved.provisionalOn === today);
    if (usable) {
      savedWon += saved.savedWon;
      checkedMonths++;
      if (month === thisMonth) includesThisMonth = true;
    } else if (month < thisMonth) {
      uncheckedMonths.push(month);
    }
  }
  return { savedWon, checkedMonths, includesThisMonth, uncheckedMonths };
}

// 실측 연비 추이: 가득→가득 구간마다 (마지막 가득 날짜, km/L). 최근 6구간.
export function kmplTrend(entries: LedgerEntry[]) {
  return measuredSpans(entries)
    .slice(-TREND_SPANS)
    .map((span) => ({ date: span.to, kmpl: Math.round((span.km / span.liters) * 10) / 10 }));
}
