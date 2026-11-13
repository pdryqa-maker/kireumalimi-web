// 주유 장부를 이 브라우저에 저장한다(시제품). 주유 예보용 기록(savedFills)은 최근 5번의 날짜와 정수 리터만 두므로,
// 단가·금액·주유소 이름까지 남기는 장부를 따로 둔다.
import { browserStore } from "./browserStore";
import type { FillRecord } from "./fillForecast";
import { cleanLedger, type LedgerEntry } from "./ledger";
import { fillStore, parseFills } from "./savedFills";

export const ledgerStore = browserStore("kireumalimi.ledger", "[]");

export function parseLedger(raw: string) {
  try {
    return cleanLedger(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function addLedgerEntry(entry: LedgerEntry) {
  return ledgerStore.write(cleanLedger([...parseLedger(ledgerStore.read()).filter((item) => item.date !== entry.date), entry]));
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
  return cleanLedger([...ledger, ...older]);
}

// 그날 주유 기록에 가득 표시와 누적 주행거리를 붙인다(계기판 사진). 그날 기록이 없으면 false.
export function markFill(date: string, mark: { full: boolean; odometerKm: number | null }) {
  const entry = mergeLedger(parseLedger(ledgerStore.read()), parseFills(fillStore.read())).find((item) => item.date === date);
  return entry ? addLedgerEntry({ ...entry, ...mark }) : false;
}

// 리포트와 점검에 보낼 장부
export const ledgerForServer = () => mergeLedger(parseLedger(ledgerStore.read()), parseFills(fillStore.read()));
