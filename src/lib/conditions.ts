// 내 알림 조건: 이용자가 걸어 둔 조건이 맞는지(또는 언제 맞을지) 보고, 보낼 알림과 보낼 때를 정한다.
// 보내는 규칙은 06 기획안의 알림 엔진 규칙을 따른다.
// 밤 9시~아침 8시에는 보내지 않고 아침 8시에 보낸다. 같은 알림은 한 번만 보낸다. 하루에 2건까지만 보낸다.
import { dayWithWeekday, koreanTime, monthDay, won } from "@/components/format";
import { wonName, type Amount, type Fill } from "./fillAmount";
import { addDays, todayKst } from "./fillForecast";
import { costPhrase, type FillCost, type FillPlan, type MonthProjection, type TaxSchedule } from "./personal";
import { FUEL_TAX_CUT, PRICE_CAP, priceCapNotice, taxCutImpact } from "./policy";
import type { SavedAlert } from "./savedAlerts";
import { fuelName } from "./profile";
import type { Watch } from "./watchSettings";

// fill은 한 번에 넣는 양을 리터로 바꾼 값. 금액을 리터로 바꿀 평균가를 아직 못 받았으면 null이고, 그때는 리터당 금액만 말한다.
export type Car = { fuel: string; fill: Fill | null };

export const RULES = { quietFrom: 21, quietTo: 8, dailyMax: 2, taxLeadDays: 7, favoriteOverWon: 30, monthlyDay: 25 };

// 내 정보와 장부로 셈한 값(personal.ts). 내 기록 요약과 같은 숫자를 쓴다.
export type Personal = {
  plan: FillPlan | null;
  cost: FillCost | null;
  tax: TaxSchedule | null;
  projection: MonthProjection | null;
  amount: Amount;
  monthlyKm: number | null;
  favoriteName: string | null;
  ureaNeeded: boolean;
};

// '지금 점검'으로 받은 단골 주유소와 요소수 결과
export type FavoriteCheck =
  | {
      fetchedAt: string;
      name: string;
      areaName: string;
      diffWon: number; // 오피넷 가격 − 동네 평균(둘 다 할인 전)
      cheaper: { name: string; paidPrice: number; discountWon: number; distanceKm: number } | null;
    }
  | { error: string };
export type UreaCheck =
  | { fetchedAt: string; from: string | null; station: { name: string; distanceKm: number | null; pricePerLiter: number | null } | null }
  | { error: string };

// 이름 뒤 조사: 끝 글자에 받침이 있으면 withFinal(이·은), 없거나 한글이 아니면 withoutFinal(가·는).
export function josa(word: string, withFinal: string, withoutFinal: string) {
  const code = word.trim().charCodeAt(word.trim().length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? withFinal : withoutFinal;
}

type Station = { name: string; price: number };
export type PriceCheck = { fetchedAt: string; matches: Station[]; lowest: Station | null } | { error: string };

export type Notice = {
  id: string;
  kind: "price" | "favorite" | "urea" | "cap" | "tax" | "forecast" | "monthly";
  title: string; // 조건 이름
  state: string; // 지금 상태 한 줄
  readyOn: string | null; // 알림을 보낼 수 있는 날. null이면 아직 조건이 맞지 않았거나 날짜를 모른다
  message: string | null; // 보낼 문장
};

export type Planned = Notice & { readyOn: string; message: string; sendOn: string; now: boolean; reason: string | null };

// 같은 날 여러 건이면 가격·단골·요소수(곧 바뀌는 정보), 최고가격, 유류세, 주유 예보, 월말 예상 순으로 먼저 보낸다.
const ORDER: Record<Notice["kind"], number> = { price: 0, favorite: 1, urea: 2, cap: 3, tax: 4, forecast: 5, monthly: 6 };

function priceNotice(alert: SavedAlert, check: PriceCheck | undefined, today: string): Notice {
  const base = {
    id: `price-${alert.id}`,
    kind: "price" as const,
    title: `${alert.areaName} ${alert.fuel} ${won(alert.belowWon)}원 이하`,
    readyOn: null,
    message: null,
  };
  if (!check) return { ...base, state: "가격은 '지금 점검'을 누르면 오피넷으로 확인해요." };
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
  const cap = priceCapNotice(car.fuel, car.fill?.liters ?? null);
  if (typeof cap.error === "string") return { ...base, state: cap.error, readyOn: null, message: null };
  const { capWon, changeWon, maxDiffWon, previousRound } = cap as Exclude<typeof cap, { error: string }>;
  const change =
    changeWon === null
      ? ""
      : changeWon === 0
        ? ` ${previousRound}차와 같아요.`
        : ` ${previousRound}차보다 ${won(Math.abs(changeWon))}원 ${changeWon < 0 ? "내려" : "올라"}` +
          (car.fill && maxDiffWon !== null ? `, ${car.fill.label}면 최대 ${won(maxDiffWon)}원 차이예요.` : "요.");
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
  const impact = taxCutImpact(car.fuel, car.fill?.liters ?? null);
  if (typeof impact.error === "string") return { ...base, state: impact.error, readyOn: null, message: null };
  if (today > endsOn) {
    return { ...base, state: `인하가 ${monthDay(endsOn)}에 끝났어요. 정부가 다시 정하면 날짜를 고쳐요.`, readyOn: null, message: null };
  }
  const { maxExtraWon, wonPerLiter } = impact as Exclude<typeof impact, { error: string }>;
  const extra =
    car.fill && maxExtraWon !== null
      ? `${fuelName(car.fuel)} ${car.fill.label}를 넣는 데 최대 ${won(maxExtraWon)}원 더 들 수 있어요.`
      : `${fuelName(car.fuel)}는 리터당 최대 ${won(wonPerLiter)}원 더 들 수 있어요.`;
  return {
    ...base,
    state: `종료 예정 ${dayWithWeekday(endsOn)}. ${dayWithWeekday(leadOn)}에 알려요.`,
    readyOn: today > leadOn ? today : leadOn,
    message:
      `${monthDay(endsOn)} 유류세 인하가 끝날 예정이에요. ${extra} ` +
      "정부가 연장하면 다시 알려 드려요.",
  };
}

function forecastNotice({ plan, cost, tax, amount, monthlyKm }: Personal): Notice {
  const base = { id: "forecast", kind: "forecast" as const, title: "내 차 주유 예보" };
  if (!plan) {
    return { ...base, state: "주유 기록을 2번 남기거나 내 정보에 한 달 주행거리를 넣으면 예보해요.", readyOn: null, message: null };
  }
  const day = dayWithWeekday(plan.nextDate);
  const state =
    plan.basis === "records"
      ? `평균 ${plan.gapDays}일마다 넣어요. 다음은 ${day}쯤이에요.`
      : `한 달 ${(monthlyKm ?? 0).toLocaleString("ko-KR")}km면 ${plan.gapDays}일마다 넣을 것 같아요. 다음은 ${day}쯤이에요.`;
  const taxText = !tax
    ? ""
    : tax.nextAfterEnd
      ? ` 유류세 인하가 ${monthDay(tax.endsOn)}에 끝나요. 그 전에 넣으면 덜 들어요.`
      : ` 유류세 인하는 ${monthDay(tax.endsOn)}까지라 이번 주유는 인하 기간 안이에요.`;
  return {
    ...base,
    state,
    readyOn: plan.notifyOn,
    message:
      `${day}쯤 주유할 때예요.` +
      (cost ? ` ${costPhrase(cost, amount)}.` : "") +
      taxText +
      (plan.basis === "monthlyKm" ? " 기록이 없어 한 달 주행거리로 셈했어요." : "") +
      " 알림 받는 날 가격으로 근처에서 덜 드는 곳을 골라 드려요.",
  };
}

// 월말 예상 지출: 매달 25일 아침. 주유 장부와 다음 주유 계획만 쓴다.
function monthlyNotice({ projection, plan }: Personal, today: string): Notice {
  const base = { id: `monthly-${today.slice(0, 7)}`, kind: "monthly" as const, title: `월말 예상 지출(매달 ${RULES.monthlyDay}일)` };
  if (Number(today.slice(8, 10)) > RULES.monthlyDay) {
    return { ...base, state: `다음 달 ${RULES.monthlyDay}일에 알려요.`, readyOn: null, message: null };
  }
  if (!projection) {
    return { ...base, state: `주유 기록이 쌓이면 ${RULES.monthlyDay}일에 이번 달 예상 지출을 알려요.`, readyOn: null, message: null };
  }
  const { projectedWon, spentWon, lastMonthWon } = projection;
  return {
    ...base,
    state: `${RULES.monthlyDay}일에 알려요. 지금 셈으로는 약 ${wonName(projectedWon)}이에요.`,
    readyOn: `${today.slice(0, 7)}-${RULES.monthlyDay}`,
    message:
      `이번 달 기름값은 약 ${wonName(projectedWon)} 쓸 것 같아요(지금까지 ${wonName(spentWon)}` +
      (lastMonthWon !== null ? `, 지난달 ${wonName(lastMonthWon)}` : "") +
      (plan?.basis === "monthlyKm" && spentWon === 0 && lastMonthWon === null
        ? "). 기록이 없어 한 달 주행거리로 셈했어요."
        : "). 주유 장부로 셈했어요."),
  };
}

// 단골 주유소가 동네 평균보다 30원 이상 비쌀 때. '지금 점검'을 눌렀을 때만 오피넷으로 확인한다.
function favoriteNotice({ favoriteName }: Personal, check: FavoriteCheck | undefined, today: string): Notice {
  const base = { id: "favorite", kind: "favorite" as const, title: `단골 주유소가 동네 평균보다 ${RULES.favoriteOverWon}원 이상 비쌀 때`, readyOn: null, message: null };
  if (!favoriteName) return { ...base, state: "주유 기록에 주유소 이름이 남으면 단골을 찾아요." };
  if (!check) return { ...base, state: `단골 ${favoriteName}. '지금 점검'을 누르면 가격을 확인해요.` };
  if ("error" in check) return { ...base, state: check.error };
  const { name, areaName, diffWon, cheaper, fetchedAt } = check;
  const gap = diffWon >= 0 ? `${won(diffWon)}원 비싸요` : `${won(-diffWon)}원 싸요`;
  if (diffWon < RULES.favoriteOverWon) {
    return { ...base, state: `${name}${josa(name, "은", "는")} ${areaName} 평균보다 ${gap}(${koreanTime(fetchedAt)} 조회). ${RULES.favoriteOverWon}원 이상 비싸지면 알려요.` };
  }
  return {
    ...base,
    id: `favorite-${today}`,
    state: `동네 평균보다 ${gap}(${koreanTime(fetchedAt)} 조회)`,
    readyOn: today,
    message:
      `${name}${josa(name, "이", "가")} ${areaName} 평균보다 리터당 ${won(diffWon)}원 비싸요(${koreanTime(fetchedAt)} 오피넷 기준).` +
      (cheaper
        ? ` 근처 ${cheaper.name}${josa(cheaper.name, "은", "는")} 리터당 ${won(cheaper.paidPrice)}원${cheaper.discountWon ? "(할인 반영)" : ""}, 직선 ${cheaper.distanceKm}km예요.`
        : ""),
  };
}

// 요소수 재고: 요소수가 필요한 경유차만. '지금 점검'을 눌렀을 때만 오피넷으로 확인한다.
function ureaNotice(check: UreaCheck | undefined, today: string): Notice {
  const base = { id: "urea", kind: "urea" as const, title: "요소수 재고", readyOn: null, message: null };
  if (!check) return { ...base, state: "'지금 점검'을 누르면 근처 요소수 재고를 확인해요." };
  if ("error" in check) return { ...base, state: check.error };
  const { station, from, fetchedAt } = check;
  if (!station) return { ...base, state: `재고가 있는 곳을 찾지 못했어요(${koreanTime(fetchedAt)} 조회).` };
  return {
    ...base,
    id: `urea-${today}`,
    state: `재고 있는 곳이 있어요(${koreanTime(fetchedAt)} 조회)`,
    readyOn: today,
    message:
      `${from ? `${from} 근처 ` : ""}요소수 재고가 있는 곳: ${station.name}` +
      (station.distanceKm !== null ? ` 직선 ${station.distanceKm}km` : "") +
      (station.pricePerLiter ? `, 리터당 ${won(station.pricePerLiter)}원` : "") +
      `(${koreanTime(fetchedAt)} 오피넷 기준). 가기 전에 전화로 재고를 확인하세요.`,
  };
}

export function buildNotices({
  watch,
  car,
  alerts,
  checks,
  personal,
  favorite,
  urea,
  today = todayKst(),
}: {
  watch: Watch;
  car: Car;
  alerts: SavedAlert[];
  checks: Record<string, PriceCheck>;
  personal: Personal;
  favorite?: FavoriteCheck;
  urea?: UreaCheck;
  today?: string;
}): Notice[] {
  return [
    ...alerts.map((alert) => priceNotice(alert, checks[alert.id], today)),
    ...(watch.favorite ? [favoriteNotice(personal, favorite, today)] : []),
    ...(watch.urea && personal.ureaNeeded ? [ureaNotice(urea, today)] : []),
    ...(watch.cap ? [capNotice(car, today)] : []),
    ...(watch.tax ? [taxNotice(car, today)] : []),
    ...(watch.forecast ? [forecastNotice(personal)] : []),
    ...(watch.monthly ? [monthlyNotice(personal, today)] : []),
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
