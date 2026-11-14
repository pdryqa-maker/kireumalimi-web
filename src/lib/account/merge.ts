// 처음 로그인할 때(이 브라우저가 아직 이 계정과 맞춘 적이 없을 때) 이 브라우저 값과 계정 값을 합친다.
// 주유 기록은 날짜로 합치고 같은 날은 계정 쪽을 쓴다. 내 정보·예보 설정은 계정에 실제로 넣은 값이 있을 때만 계정 쪽을 쓴다.
// 여러 번 해도 결과가 같다(mergeAccount(x, x).merged는 x).
import { cleanLedger, MAX_SAVED_LEDGER, type LedgerEntry } from "../ledger";
import { cleanProfile, GUEST, type Profile } from "../profile";
import { parseWatch, type Watch } from "../watchSettings";
import type { FillRecord } from "../fillForecast";
import type { SavedAlert } from "../savedAlerts";
import { cleanAlerts, cleanFills, type AccountData } from "./fields";

// 부를 이름을 빼고 기본값과 다른 칸이 있으면 이용자가 채운 내 정보로 본다.
export const isFilledProfile = (profile: Profile) =>
  JSON.stringify(cleanProfile({ ...profile, name: "" })) !== JSON.stringify(cleanProfile(GUEST));

// 알림 탭에서 켜는 조건이 늘어나도 따라가도록 칸 이름을 적지 않고 전부 본다.
export const anyWatch = (watch: Watch) => Object.values(watch).some((on) => on === true);

const byDate = <T extends { date: string }>(local: T[], remote: T[]) => {
  const map = new Map<string, T>();
  for (const item of [...local, ...remote]) map.set(item.date, item); // 같은 날은 계정(remote) 쪽이 덮는다
  return [...map.values()];
};

// 아직 못 올린 이 브라우저 장부를 계정 장부와 날짜로 합친다. 같은 날은 이 브라우저 쪽을 쓴다.
// 장부에는 지우는 기능이 없어(더하거나 같은 날을 바꾸기만 한다) 합쳐도 지운 기록이 되살아나지 않는다.
export const joinLedger = (local: LedgerEntry[] = [], remote: LedgerEntry[] = []) =>
  cleanLedger(byDate<LedgerEntry>(remote, local), MAX_SAVED_LEDGER);

const alertKey = (alert: SavedAlert) => `${alert.fuel}|${alert.area}|${alert.belowWon}`;

const recordDates = (data: AccountData) => new Set([...(data.ledger ?? []), ...(data.fills ?? [])].map((item) => item.date));

export function mergeAccount(
  local: AccountData,
  remote: AccountData,
): { merged: Required<AccountData>; addedFills: number } {
  const localProfile = cleanProfile(local.profile ?? GUEST);
  const remoteProfile = remote.profile ? cleanProfile(remote.profile) : null;
  const base = remoteProfile && isFilledProfile(remoteProfile) ? remoteProfile : localProfile;
  const name = remoteProfile?.name || localProfile.name;

  const alerts = new Map<string, SavedAlert>();
  for (const alert of remote.alerts ?? []) alerts.set(alertKey(alert), alert);
  for (const alert of local.alerts ?? []) if (!alerts.has(alertKey(alert))) alerts.set(alertKey(alert), alert);

  const remoteWatch = parseWatch(JSON.stringify(remote.watch ?? {}));
  const localWatch = parseWatch(JSON.stringify(local.watch ?? {}));

  const known = recordDates(remote);
  const addedFills = [...recordDates(local)].filter((date) => !known.has(date)).length;

  return {
    merged: {
      profile: cleanProfile({ ...base, name }),
      ledger: cleanLedger(byDate<LedgerEntry>(local.ledger ?? [], remote.ledger ?? []), MAX_SAVED_LEDGER),
      fills: cleanFills(byDate<FillRecord>(local.fills ?? [], remote.fills ?? [])),
      alerts: cleanAlerts([...alerts.values()].sort((a, b) => Number(a.id) - Number(b.id))),
      watch: anyWatch(remoteWatch) ? remoteWatch : localWatch,
    },
    addedFills,
  };
}
