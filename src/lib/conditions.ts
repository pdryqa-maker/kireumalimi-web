// 내 알림 조건: 이용자가 걸어 둔 조건이 맞는지(또는 언제 맞을지) 보고, 보낼 알림과 보낼 때를 정한다.
// 보내는 규칙은 06 기획안의 알림 엔진 규칙을 따른다.
// 밤 9시~아침 8시에는 보내지 않고 아침 8시에 보낸다. 같은 알림은 한 번만 보낸다. 하루에 2건까지만 보낸다.
import { dayWithWeekday, koreanTime, monthDay, won } from "@/components/format";
import { addDays, forecastNextFill, MIN_RECORDS, todayKst, type FillRecord } from "./fillForecast";
import { FUEL_TAX_CUT, PRICE_CAP, priceCapNotice, taxCutImpact } from "./policy";
import type { SavedAlert } from "./savedAlerts";
import { fuelName } from "./profile";
import type { Watch } from "./watchSettings";

export type Car = { fuel: string; liters: number };

export const RULES = { quietFrom: 21, quietTo: 8, dailyMax: 2, taxLeadDays: 7 };

type Station = { name: string; price: number };
export type PriceCheck = { fetchedAt: string; matches: Station[]; lowest: Station | null } | { error: string };

export type Notice = {
  id: string;
  kind: "price" | "cap" | "tax" | "forecast";
  title: string; // 조건 이름
  state: string; // 지금 상태 한 줄
  readyOn: string | null; // 알림을 보낼 수 있는 날. null이면 아직 조건이 맞지 않았거나 날짜를 모른다
  message: string | null; // 보낼 문장
};

export type Planned = Notice & { readyOn: string; message: string; sendOn: string; now: boolean; reason: string | null };

// 같은 날 여러 건이면 가격(곧 바뀌는 정보), 최고가격, 유류세, 주유 예보 순으로 먼저 보낸다.
const ORDER: Record<Notice["kind"], number> = { price: 0, cap: 1, tax: 2, forecast: 3 };

function priceNotice(alert: SavedAlert, check: PriceCheck | undefined, today: string): Notice {
  const base = {
    id: `price-${alert.id}`,
    kind: "price" as const,
    title: `${alert.areaName} ${alert.fuel} ${won(alert.belowWon)}원 이하`,
    readyOn: null,
    message: null,
  };
  if (!check) return { ...base, state: "가격은 '가격 지금 점검'을 누르면 오피넷으로 확인해요." };
  if ("error" in check) return { ...base, state: check.error };
  const best = check.matches[0];
  if (!best) {
    const lowest = check.lowest ? `${check.lowest.name} ${won(check.lowest.price)}원` : "가격 없음";
    return { ...base, state: `아직 아니에요. 지금 최저 ${lowest}(${koreanTime(check.fetchedAt)} 조회)` };
  }
  return {
    ...base,
    state: `조건에 맞는 곳이 있어요(${koreanTime(check.fetchedAt)} 조회)`,
    readyOn: today,
    message:
      `${alert.areaName} ${alert.fuel} ${won(alert.belowWon)}원 이하 주유소가 생겼어요. ` +
      `${best.name} 리터당 ${won(best.price)}원(${koreanTime(check.fetchedAt)} 오피넷 기준). 현장 가격과 다를 수 있어요.`,
  };
}

function capNotice(car: Car, today: string): Notice {
  const latest = PRICE_CAP.rounds.at(-1)!;
  const base = { id: "cap", kind: "cap" as const, title: "석유 최고가격 새 고시 발표 직후" };
  // 발표일부터 적용일까지를 이번 고시의 알림 때로 본다. 그 뒤에는 다음 고시를 기다린다.
  if (today < latest.announcedOn || today > latest.startsOn) {
    return {
      ...base,
      state: `지금은 ${latest.round}차 고시 적용 중(${monthDay(latest.startsOn)}부터). 다음 고시가 나오면 바로 알려요.`,
      readyOn: null,
      message: null,
    };
  }
  const cap = priceCapNotice(car.fuel, car.liters);
  if (typeof cap.error === "string") return { ...base, state: cap.error, readyOn: null, message: null };
  const { capWon, changeWon, maxDiffWon, previousRound } = cap as Exclude<typeof cap, { error: string }>;
  const change =
    changeWon === null || maxDiffWon === null
      ? ""
      : changeWon === 0
        ? ` ${previousRound}차와 같아요.`
        : ` ${previousRound}차보다 ${won(Math.abs(changeWon))}원 ${changeWon < 0 ? "내려" : "올라"}, ${car.liters}L면 최대 ${won(maxDiffWon)}원 차이예요.`;
  return {
    ...base,
    state: `${latest.round}차 고시가 ${monthDay(latest.announcedOn)}에 나왔어요.`,
    readyOn: today,
    message:
      `${latest.round}차 석유 최고가격이 ${monthDay(latest.startsOn)}부터 적용돼요. ` +
      `${fuelName(car.fuel)} 공급가 상한은 리터당 ${won(capWon)}원이에요.${change} 주유소 판매가의 상한은 아니에요.`,
  };
}

function taxNotice(car: Car, today: string): Notice {
  const { endsOn } = FUEL_TAX_CUT;
  const leadOn = addDays(endsOn, -RULES.taxLeadDays);
  const base = { id: "tax", kind: "tax" as const, title: `유류세 인하 종료 ${RULES.taxLeadDays}일 전` };
  const impact = taxCutImpact(car.fuel, car.liters);
  if (typeof impact.error === "string") return { ...base, state: impact.error, readyOn: null, message: null };
  if (today > endsOn) {
    return { ...base, state: `인하가 ${monthDay(endsOn)}에 끝났어요. 정부가 다시 정하면 날짜를 고쳐요.`, readyOn: null, message: null };
  }
  const { maxExtraWon } = impact as Exclude<typeof impact, { error: string }>;
  return {
    ...base,
    state: `종료 예정 ${dayWithWeekday(endsOn)}. ${dayWithWeekday(leadOn)}에 알려요.`,
    readyOn: today > leadOn ? today : leadOn,
    message:
      `${monthDay(endsOn)} 유류세 인하가 끝날 예정이에요. ${fuelName(car.fuel)} ${car.liters}L면 최대 ${won(maxExtraWon)}원 더 들 수 있어요. ` +
      "정부가 연장하면 다시 알려 드려요.",
  };
}

function forecastNotice(fills: FillRecord[], today: string): Notice {
  const base = { id: "forecast", kind: "forecast" as const, title: "내 차 주유 예보", readyOn: null, message: null };
  if (fills.length < MIN_RECORDS) return { ...base, state: `주유 기록이 ${MIN_RECORDS}번 이상 있어야 해요.` };
  try {
    const forecast = forecastNextFill(fills, today);
    return {
      ...base,
      state: `평균 ${forecast.avgGapDays}일마다 넣어요. 다음은 ${dayWithWeekday(forecast.nextDate)}쯤이에요.`,
      readyOn: forecast.notifyOn,
      message: `${dayWithWeekday(forecast.nextDate)}쯤 주유할 때예요. 알림 받는 날 가격으로 근처에서 덜 드는 곳을 골라 드려요.`,
    };
  } catch (problem) {
    if (problem instanceof RangeError) return { ...base, state: problem.message };
    throw problem;
  }
}

export function buildNotices({
  watch,
  car,
  alerts,
  checks,
  fills,
  today = todayKst(),
}: {
  watch: Watch;
  car: Car;
  alerts: SavedAlert[];
  checks: Record<string, PriceCheck>;
  fills: FillRecord[];
  today?: string;
}): Notice[] {
  return [
    ...alerts.map((alert) => priceNotice(alert, checks[alert.id], today)),
    ...(watch.cap ? [capNotice(car, today)] : []),
    ...(watch.tax ? [taxNotice(car, today)] : []),
    ...(watch.forecast ? [forecastNotice(fills, today)] : []),
  ];
}

// 한국 시간의 날짜와 시(0~23)
export function kstClock(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  return { today: todayKst(now), hour };
}

// 보낼 수 있는 알림에 보내는 날을 정한다. 조건이 아직 맞지 않은 알림은 빼고 돌려준다.
export function scheduleNotices(notices: Notice[], now = new Date()): Planned[] {
  const { today, hour } = kstClock(now);
  const quiet = hour >= RULES.quietFrom || hour < RULES.quietTo;
  const perDay = new Map<string, number>();
  return notices
    .filter((notice): notice is Notice & { readyOn: string; message: string } => !!notice.readyOn && !!notice.message)
    .sort((a, b) => a.readyOn.localeCompare(b.readyOn) || ORDER[a.kind] - ORDER[b.kind])
    .map((notice) => {
      let sendOn = notice.readyOn;
      let reason: string | null = null;
      if (sendOn === today && quiet) {
        if (hour >= RULES.quietFrom) sendOn = addDays(today, 1);
        reason = `밤 ${RULES.quietFrom - 12}시~아침 ${RULES.quietTo}시에는 보내지 않아요.`;
      }
      while ((perDay.get(sendOn) ?? 0) >= RULES.dailyMax) {
        sendOn = addDays(sendOn, 1);
        reason = `하루 ${RULES.dailyMax}건을 넘어 다음 날로 미뤘어요.`;
      }
      perDay.set(sendOn, (perDay.get(sendOn) ?? 0) + 1);
      return { ...notice, sendOn, now: sendOn === today && !quiet, reason };
    })
    .sort((a, b) => a.sendOn.localeCompare(b.sendOn));
}
