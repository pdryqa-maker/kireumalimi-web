// 계정에 올리는 칸. 브라우저 저장소 키와 짝을 맞추고, 서버는 받은 값을 브라우저와 같은 검사 함수로 다시 검사해 저장한다.
// 다른 작업이 Profile에 칸을 더해도 cleanProfile만 고치면 계정에도 그대로 반영된다.
import { MAX_RECORDS, type FillRecord } from "../fillForecast";
import { cleanLedger, MAX_SAVED_LEDGER, type LedgerEntry } from "../ledger";
import { cleanProfile, type Profile } from "../profile";
import { MAX_ALERTS, parseAlerts, type SavedAlert } from "../savedAlerts";
import { parseFills } from "../savedFills";
import { parseWatch, type Watch } from "../watchSettings";

export const SYNC_FIELDS = ["profile", "fills", "ledger", "alerts", "watch"] as const;
export type SyncField = (typeof SYNC_FIELDS)[number];
export const isSyncField = (value: string): value is SyncField => (SYNC_FIELDS as readonly string[]).includes(value);

export const STORE_KEYS: Record<SyncField, string> = {
  profile: "kireumalimi.profile",
  fills: "kireumalimi.fills",
  ledger: "kireumalimi.ledger",
  alerts: "kireumalimi.alerts",
  watch: "kireumalimi.watch",
};

export type AccountData = Partial<{ profile: Profile; fills: FillRecord[]; ledger: LedgerEntry[]; alerts: SavedAlert[]; watch: Watch }>;

export const MAX_FIELD_BYTES = 65_536;
export const REDIS_TTL = 365 * 24 * 60 * 60; // 1년 동안 쓰지 않으면 지운다
export const accountKey = (id: string) => `acct:${id}`;
export const failKey = (id: string) => `fail:${id}`;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const intOrNull = (value: unknown) => (Number.isInteger(value) ? (value as number) : null);

export function cleanFills(value: unknown): FillRecord[] {
  return parseFills(JSON.stringify(Array.isArray(value) ? value : []))
    .map((fill) => ({ date: fill.date, won: intOrNull(fill.won), liters: intOrNull(fill.liters) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_RECORDS);
}

export function cleanAlerts(value: unknown): SavedAlert[] {
  return parseAlerts(JSON.stringify(Array.isArray(value) ? value : []))
    .map((alert) => ({ id: alert.id, fuel: text(alert.fuel), area: text(alert.area), areaName: text(alert.areaName), belowWon: alert.belowWon }))
    .slice(-MAX_ALERTS);
}

export function cleanField(field: SyncField, value: unknown) {
  switch (field) {
    case "profile":
      return cleanProfile(value);
    case "fills":
      return cleanFills(value);
    case "ledger":
      return cleanLedger(value, MAX_SAVED_LEDGER);
    case "alerts":
      return cleanAlerts(value);
    case "watch":
      return parseWatch(JSON.stringify(value ?? {}));
  }
}

// Redis 해시를 계정 데이터로 읽는다. 비밀번호(auth)와 meta는 빼고, 깨진 칸은 없는 것으로 본다.
export function parseStored(hash: Record<string, string>): AccountData {
  const data: Record<string, unknown> = {};
  for (const field of SYNC_FIELDS) {
    if (!(field in hash)) continue;
    try {
      data[field] = cleanField(field, JSON.parse(hash[field]));
    } catch {}
  }
  return data as AccountData;
}
