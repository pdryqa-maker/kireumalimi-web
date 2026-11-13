// 내 차 주유 기록. 시제품이라 이 브라우저에만 저장한다(실제 서비스는 카카오톡 채널에서 받는다).
import type { FillRecord } from "./fillForecast";

const KEY = "kireumalimi.fills";

export function loadFills(): FillRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item) => typeof item?.date === "string" && Number.isInteger(item?.liters))
      : [];
  } catch {
    return [];
  }
}

export function saveFills(records: FillRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}
