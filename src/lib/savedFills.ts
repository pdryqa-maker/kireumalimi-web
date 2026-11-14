// 내 차 주유 기록. 이 브라우저에 저장하고, 로그인했으면 accountSync가 계정에도 올린다.
import { browserStore, parseList } from "./browserStore";
import type { FillRecord } from "./fillForecast";

export const fillStore = browserStore("kireumalimi.fills", "[]");

export const parseFills = (raw: string) =>
  parseList<FillRecord>(
    raw,
    (item) => typeof item?.date === "string" && (Number.isInteger(item?.liters) || Number.isInteger(item?.won)),
  );

export const loadFills = () => parseFills(fillStore.read());

export const saveFills = (records: FillRecord[]) => fillStore.write(records);
