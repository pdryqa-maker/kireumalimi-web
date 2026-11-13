// 이용자가 저장한 가격 알림 조건. 시제품이라 이 브라우저에만 저장한다(실제 서비스는 카카오톡 채널 구독, 제안).
import { browserStore, parseList } from "./browserStore";

export type SavedAlert = { id: string; fuel: string; area: string; areaName: string; belowWon: number };

export const MAX_ALERTS = 5;

export const alertStore = browserStore("kireumalimi.alerts", "[]");

export const parseAlerts = (raw: string) =>
  parseList<SavedAlert>(raw, (item) => typeof item?.id === "string" && Number.isInteger(item?.belowWon));

export function addAlert(alert: Omit<SavedAlert, "id">) {
  const list = parseAlerts(alertStore.read()).filter(
    (item) => !(item.fuel === alert.fuel && item.area === alert.area && item.belowWon === alert.belowWon),
  );
  return alertStore.write([...list, { ...alert, id: `${Date.now()}` }].slice(-MAX_ALERTS));
}

export function removeAlert(id: string) {
  alertStore.write(parseAlerts(alertStore.read()).filter((item) => item.id !== id));
}
