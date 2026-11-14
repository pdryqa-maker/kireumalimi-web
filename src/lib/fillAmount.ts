// 한 번에 넣는 양. 주유소에서 주문하듯 금액(5만원어치)이나 가득으로 받는다.
// 계산은 리터로 하므로, 금액은 그날 평균 판매가로 리터로 바꾸고 가득은 내 영수증의 리터(없으면 기본값)를 쓴다.
// 브라우저와 서버가 함께 쓴다. 평균 판매가를 받아 오는 일은 서버(fillPrice.ts)가 한다.
import { MAX_LITERS } from "./policy";

export type Amount = number | "full"; // 원 단위 금액, 또는 가득

export const AMOUNT_CHOICES: Amount[] = [30000, 50000, 70000, 100000, "full"];
export const DEFAULT_AMOUNT: Amount = 50000;
export const DEFAULT_FULL_LITERS = 40;
export const AMOUNT_LIMITS = { minWon: 5000, maxWon: 300000, stepWon: 1000 };
const RECENT_FILLS = 5;
const MIN_KNOWN_FILLS = 2;

const clampLiters = (liters: number) => Math.min(Math.max(Math.round(liters), 1), MAX_LITERS);
export const isLiters = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_LITERS;

export function cleanWon(value: unknown): number | null {
  const won = Number(value);
  const { minWon, maxWon, stepWon } = AMOUNT_LIMITS;
  return Number.isInteger(won) && won >= minWon && won <= maxWon && won % stepWon === 0 ? won : null;
}

export function cleanAmount(value: unknown): Amount | null {
  return value === "full" ? "full" : cleanWon(value);
}

// 50000 → "5만원", 45000 → "4만 5천원", 8000 → "8천원"
// 천원 자리에서 반올림한 말(139,880 → "14만원"). 천원이 안 되면 그대로 쓴다.
export function wonName(won: number) {
  const thousands = Math.round(won / 1000);
  if (thousands === 0) return `${won.toLocaleString("ko-KR")}원`;
  const man = Math.floor(thousands / 10);
  const chun = thousands % 10;
  return `${[man ? `${man}만` : "", chun ? `${chun}천` : ""].filter(Boolean).join(" ")}원`;
}

export const amountName = (amount: Amount) => (amount === "full" ? "가득" : `${wonName(amount)}어치`);
export const amountShort = (amount: Amount) => (amount === "full" ? "가득" : wonName(amount));

export type FullLiters = { liters: number; from: "receipts" | "default"; fills: number };

// 가득일 때의 리터. 리터를 아는 주유가 2번 이상이면 최근 5번의 가운데값, 아니면 기본값.
// '가득 넣었어요'로 표시한 주유가 2번 이상이면 그 주유만 본다.
export function fullLiters(fills: { liters: number | null; full?: boolean }[], fallback = DEFAULT_FULL_LITERS): FullLiters {
  const marked = fills.filter((fill) => fill.full && typeof fill.liters === "number" && fill.liters > 0);
  const known = (marked.length >= MIN_KNOWN_FILLS ? marked : fills)
    .map((fill) => fill.liters)
    .filter((liters): liters is number => typeof liters === "number" && liters > 0)
    .slice(-RECENT_FILLS);
  if (known.length < MIN_KNOWN_FILLS) return { liters: clampLiters(fallback), from: "default", fills: 0 };
  const sorted = [...known].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { liters: clampLiters(median), from: "receipts", fills: known.length };
}

export const fullNote = (full: FullLiters) =>
  full.from === "receipts"
    ? `가득은 최근 영수증 ${full.fills}번의 가운데값 ${full.liters}L로 계산해요.`
    : `가득은 약 ${full.liters}L로 계산해요. 영수증을 남기면 내 평균으로 바뀌어요.`;

// 계산에 쓰는 주유량. label은 답과 화면에 그대로 쓴다.
export type Fill = {
  amount: Amount | null; // null이면 이용자가 리터로 말한 경우
  won: number | null;
  liters: number;
  label: string; // "5만원어치(약 27L)", "가득(약 40L)", "40L"
  pricePerLiter: number | null; // 금액을 리터로 바꿀 때 쓴 평균 판매가
  priceBasis: string | null; // 그 가격이 무엇인지
  fullBasis: string | null; // 가득일 때 리터를 정한 근거
};

export type Price = { pricePerLiter: number; basis: string };

// 금액을 리터로 바꾸려면 가격이 있어야 한다. 가격이 없으면 null.
export function makeFill(amount: Amount, full: FullLiters, price: Price | null): Fill | null {
  if (amount === "full") {
    return {
      amount,
      won: null,
      liters: full.liters,
      label: `가득(약 ${full.liters}L)`,
      pricePerLiter: null,
      priceBasis: null,
      fullBasis: fullNote(full),
    };
  }
  if (!price || !(price.pricePerLiter > 0)) return null;
  const liters = clampLiters(amount / price.pricePerLiter);
  return {
    amount,
    won: amount,
    liters,
    label: `${amountName(amount)}(약 ${liters}L)`,
    pricePerLiter: price.pricePerLiter,
    priceBasis: price.basis,
    fullBasis: null,
  };
}

export const litersFill = (liters: number): Fill => ({
  amount: null,
  won: null,
  liters,
  label: `${liters}L`,
  pricePerLiter: null,
  priceBasis: null,
  fullBasis: null,
});

// 서버 경로에 보낼 값. 가득이면 가득일 때의 리터도 함께 보낸다(영수증은 브라우저에만 있다).
export function amountQuery(amount: Amount, full: FullLiters): Record<string, string> {
  return amount === "full" ? { amount: "full", full: String(full.liters), fullFrom: full.from, fullFills: String(full.fills) } : { amount: String(amount) };
}

// 서버 경로가 받는 값. 예전 화면이 보내는 liters도 받는다. 맞지 않으면 null.
export type FillRequest = { amount: Amount; full: FullLiters } | { liters: number };

export function fillRequestFrom(params: URLSearchParams): FillRequest | null {
  const amount = cleanAmount(params.get("amount"));
  if (amount !== null) {
    const liters = Number(params.get("full") ?? DEFAULT_FULL_LITERS);
    const fills = Number(params.get("fullFills") ?? 0);
    const full: FullLiters = {
      liters: isLiters(liters) ? liters : DEFAULT_FULL_LITERS,
      from: params.get("fullFrom") === "receipts" ? "receipts" : "default",
      fills: Number.isInteger(fills) && fills >= 0 && fills <= RECENT_FILLS ? fills : 0,
    };
    return { amount, full };
  }
  const liters = Number(params.get("liters"));
  return params.has("liters") && isLiters(liters) ? { liters } : null;
}
