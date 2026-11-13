// 주유 장부. 영수증이나 주유 기록 카드로 넣은 주유를 최근 30번까지 이 브라우저에 남긴다.
// 월간 리포트와 주유소 점검이 쓴다. 서버는 브라우저가 보낸 값을 cleanLedger로 다시 검사해서 쓴다.
import { MAX_LITERS } from "./policy";

export type LedgerEntry = {
  date: string; // YYYY-MM-DD
  liters: number | null; // 영수증에 적힌 양(소수 둘째 자리까지). 금액만 적은 주유 기록이면 모른다
  pricePerLiter: number | null; // 리터당 단가(원)
  totalWon: number | null; // 결제 금액(원)
  stationName: string | null;
  full: boolean; // 가득 넣었는지. 가득→가득 사이로 실측 연비를 셈한다
  odometerKm: number | null; // 그때 계기판의 누적 주행거리(km)
};

export const MAX_LEDGER = 30;
export const MAX_ODOMETER_KM = 2_000_000;

const positiveInt = (value: unknown, max: number) =>
  Number.isInteger(value) && Number(value) > 0 && Number(value) <= max ? Number(value) : null;

// 주유소 이름은 AI에 도구 결과로 들어가므로 글자, 숫자, 띄어쓰기, 몇 가지 부호만 남긴다.
const cleanName = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/[^\p{L}\p{N} ()㈜\-]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40) || null
    : null;

export function cleanEntry(value: unknown): LedgerEntry | null {
  const item = (value ?? {}) as Partial<LedgerEntry>;
  const date = String(item.date ?? "");
  const rounded = Math.round(Number(item.liters) * 100) / 100;
  const liters = item.liters !== null && Number.isFinite(rounded) && rounded > 0 && rounded <= MAX_LITERS ? rounded : null;
  const totalWon = positiveInt(item.totalWon, 2_000_000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return null;
  // 넣은 양이나 결제 금액 가운데 하나는 있어야 주유 기록이다.
  if (liters === null && totalWon === null) return null;
  return {
    date,
    liters,
    pricePerLiter: positiveInt(item.pricePerLiter, 5000),
    totalWon,
    stationName: cleanName(item.stationName),
    full: item.full === true,
    odometerKm: positiveInt(item.odometerKm, MAX_ODOMETER_KM),
  };
}

// 같은 날 기록은 나중 것을 남기고, 날짜순으로 최근 30번만 쓴다.
export function cleanLedger(value: unknown): LedgerEntry[] {
  if (!Array.isArray(value)) return [];
  const byDate = new Map<string, LedgerEntry>();
  for (const item of value.slice(-MAX_LEDGER * 2)) {
    const entry = cleanEntry(item);
    if (entry) byDate.set(entry.date, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_LEDGER);
}
