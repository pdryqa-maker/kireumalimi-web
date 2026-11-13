// 이용자가 저장한 가격 알림 조건. 시제품이라 이 브라우저에만 저장한다(실제 서비스는 카카오톡 채널 구독).
// 개인 차단 모드 등으로 저장소를 못 쓰면 저장하지 못한 채로 동작한다.
export type SavedAlert = { id: string; fuel: string; area: string; areaName: string; belowWon: number };

const KEY = "kireumalimi.alerts";
const EVENT = "kireumalimi-alerts";
const MAX = 5;

function read() {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export const alertStore = {
  subscribe(onChange: () => void) {
    window.addEventListener("storage", onChange);
    window.addEventListener(EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(EVENT, onChange);
    };
  },
  getSnapshot: read,
  getServerSnapshot: () => "[]",
};

export function parseAlerts(raw: string): SavedAlert[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(list: SavedAlert[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  } finally {
    window.dispatchEvent(new Event(EVENT));
  }
}

export function addAlert(alert: Omit<SavedAlert, "id">) {
  const list = parseAlerts(read()).filter(
    (item) => !(item.fuel === alert.fuel && item.area === alert.area && item.belowWon === alert.belowWon),
  );
  return write([...list, { ...alert, id: `${Date.now()}` }].slice(-MAX));
}

export function removeAlert(id: string) {
  write(parseAlerts(read()).filter((item) => item.id !== id));
}
