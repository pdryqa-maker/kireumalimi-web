// 주유 장부를 이 브라우저에 저장한다(시제품). 주유 예보용 기록(savedFills)은 최근 5번의 날짜와 정수 리터만 두므로,
// 단가·금액·주유소 이름까지 남기는 장부를 따로 둔다.
import { browserStore } from "./browserStore";
import type { FillRecord } from "./fillForecast";
import { previousMonth } from "./fillTotals";
import { cleanLedger, MAX_LEDGER, MAX_SAVED_LEDGER, type LedgerEntry } from "./ledger";
import { fillStore, parseFills } from "./savedFills";

export const ledgerStore = browserStore("kireumalimi.ledger", "[]");

export function parseLedger(raw: string) {
  try {
    return cleanLedger(JSON.parse(raw), MAX_SAVED_LEDGER);
  } catch {
    return [];
  }
}

// 같은 영수증인지(같은 날, 같은 양·금액·주유소). 같은 사진을 다시 넣거나 가득 표시만 바꿀 때는 덮어쓴다.
export const sameReceipt = (a: LedgerEntry, b: LedgerEntry) =>
  a.date === b.date && a.liters === b.liters && a.totalWon === b.totalWon && a.stationName === b.stationName;

// 장부는 하루에 한 줄이다(연비·예보·리포트가 날짜로 묶는다). 같은 날 다른 영수증이 오면 덮어쓰지 않고 양과 금액을 더한다.
// 한쪽이라도 양이나 금액을 모르면 합계를 모르므로, 둘 다 모르게 되는 경우에만 나중 것을 남긴다.
export function mergeSameDay(earlier: LedgerEntry, later: LedgerEntry): LedgerEntry {
  if (sameReceipt(earlier, later)) return later;
  const add = (a: number | null, b: number | null) => (a !== null && b !== null ? Math.round((a + b) * 100) / 100 : null);
  const liters = add(earlier.liters, later.liters);
  const totalWon = add(earlier.totalWon, later.totalWon);
  if (liters === null && totalWon === null) return later;
  const names = [earlier.stationName, later.stationName];
  return {
    date: later.date,
    liters,
    totalWon,
    pricePerLiter: liters && totalWon ? Math.round(totalWon / liters) : null,
    // 주유소가 다르면 '○○ 외 1곳'으로 남겨, 한 주유소의 단가로 잘못 비교하지 않게 한다.
    stationName: names[0] === names[1] ? names[1] : names[1] && names[0] ? `${names[1]} 외 1곳` : (names[1] ?? names[0]),
    full: later.full || earlier.full,
    odometerKm: later.odometerKm ?? earlier.odometerKm,
  };
}

export function addLedgerEntry(entry: LedgerEntry) {
  const saved = parseLedger(ledgerStore.read());
  const sameDay = saved.find((item) => item.date === entry.date);
  return ledgerStore.write(
    cleanLedger([...saved.filter((item) => item.date !== entry.date), sameDay ? mergeSameDay(sameDay, entry) : entry], MAX_SAVED_LEDGER),
  );
}

// 장부에 주유 기록(날짜와 금액이나 리터, 장부가 생기기 전에 넣은 것이나 직접 넣은 것)을 합친다. 같은 날이면 장부 쪽을 쓴다.
export function mergeLedger(ledger: LedgerEntry[], fills: FillRecord[]): LedgerEntry[] {
  const dates = new Set(ledger.map((entry) => entry.date));
  const older = fills
    .filter((record) => !dates.has(record.date))
    .map((record) => ({
      date: record.date,
      liters: record.liters ?? null,
      pricePerLiter: null,
      totalWon: record.won ?? null,
      stationName: null,
      full: false,
      odometerKm: null,
    }));
  return cleanLedger([...ledger, ...older], MAX_SAVED_LEDGER);
}

// 그날 주유 기록에 가득 표시와 누적 주행거리를 붙인다(계기판 사진). 그날 기록이 없으면 false.
export function markFill(date: string, mark: { full: boolean; odometerKm: number | null }) {
  const entry = savedLedgerAll().find((item) => item.date === date);
  return entry ? addLedgerEntry({ ...entry, ...mark }) : false;
}

// 이 브라우저의 장부 전체(최근 100번). 내 기록 대시보드가 쓴다.
export const savedLedgerAll = () => mergeLedger(parseLedger(ledgerStore.read()), parseFills(fillStore.read()));

// 챗봇과 점검에 보낼 장부: 최근 30번
export const ledgerForServer = () => savedLedgerAll().slice(-MAX_LEDGER);

// 월간 리포트에 보낼 장부: 그 달과 전달 기록만(최근 30번 밖의 달도 리포트가 비지 않게), 그 안에서 최근 30번
export const ledgerForMonth = (month: string) => {
  const prev = previousMonth(month);
  return savedLedgerAll()
    .filter((entry) => entry.date.startsWith(month) || entry.date.startsWith(prev))
    .slice(-MAX_LEDGER);
};
