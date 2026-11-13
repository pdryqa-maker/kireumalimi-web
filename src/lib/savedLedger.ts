// 주유 장부를 이 브라우저에 저장한다(시제품). 주유 예보용 기록(savedFills)은 최근 5번의 날짜와 정수 리터만 두므로,
// 단가·금액·주유소 이름까지 남기는 장부를 따로 둔다.
import { browserStore } from "./browserStore";
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

// 리포트와 점검에 보낼 장부. 장부가 생기기 전에 넣은 주유 기록(날짜와 리터만)도 함께 넣는다.
export function ledgerForServer(): LedgerEntry[] {
  const ledger = parseLedger(ledgerStore.read());
  const dates = new Set(ledger.map((entry) => entry.date));
  const older = parseFills(fillStore.read())
    .filter((record) => !dates.has(record.date))
    .map((record) => ({ date: record.date, liters: record.liters, pricePerLiter: null, totalWon: null, stationName: null }));
  return cleanLedger([...ledger, ...older]);
}
