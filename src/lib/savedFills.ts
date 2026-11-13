// 내 차 주유 기록. 시제품이라 이 브라우저에만 저장한다(실제 서비스는 카카오톡 채널에서 받는다, 제안).
import { browserStore, parseList } from "./browserStore";
import type { FillRecord } from "./fillForecast";

export const fillStore = browserStore("kireumalimi.fills", "[]");

export const parseFills = (raw: string) =>
  parseList<FillRecord>(raw, (item) => typeof item?.date === "string" && Number.isInteger(item?.liters));

export const loadFills = () => parseFills(fillStore.read());

export const saveFills = (records: FillRecord[]) => fillStore.write(records);
