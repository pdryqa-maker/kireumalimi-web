// 내 차 주유 예보. 주유 기록 두세 번의 간격으로 다음 주유일을 셈한다.
// 가격을 예측하지 않는다. 이용자 본인의 주유 간격만 기록으로 계산한다.
import { AMOUNT_LIMITS, isLiters } from "./fillAmount";
import { MAX_LITERS } from "./policy";

// 주유 기록. 직접 넣을 때는 금액(won)으로 받고, 영수증과 예전 기록에는 리터(liters)가 있다. 둘 중 하나는 있어야 한다.
export type FillRecord = { date: string; won?: number | null; liters?: number | null };

// 기록의 금액은 기억나는 대로 넣을 수 있게 천원 단위가 아니어도 받는다.
export const RECORD_WON = { min: 1000, max: 1_000_000 };
const recordWon = (value: unknown) =>
  Number.isInteger(value) && (value as number) >= RECORD_WON.min && (value as number) <= RECORD_WON.max ? (value as number) : null;

export const MIN_RECORDS = 2;
export const MAX_RECORDS = 5;
const MAX_GAP_DAYS = 60;
const MAX_AGE_DAYS = 180;
const DAY = 86_400_000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 오늘 날짜(한국 시간) "YYYY-MM-DD"
export function todayKst(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

function toDay(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const time = Date.UTC(year, month - 1, day);
  // 2월 30일처럼 없는 날짜는 다른 날로 넘어가므로 되돌려 확인한다.
  return new Date(time).toISOString().slice(0, 10) === date ? time / DAY : null;
}

const fromDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
export const addDays = (date: string, days: number) => fromDay(toDay(date)! + days);
export const daysBetween = (from: string, to: string) => toDay(to)! - toDay(from)!;
export const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

// 예보를 알리는 날: 예상일이 든 주의 월요일 아침. 그 월요일이 이미 지났으면 오늘.
export function notifyDay(nextDate: string, today: string) {
  const nextDay = toDay(nextDate)!;
  const mondayOfWeek = nextDay - ((new Date(nextDay * DAY).getUTCDay() + 6) % 7);
  return fromDay(Math.max(mondayOfWeek, toDay(today)!));
}

// 기록을 확인한다. 문제가 있으면 이용자에게 보여 줄 문장을 던진다.
export function cleanRecords(records: FillRecord[], today = todayKst()) {
  if (records.length < MIN_RECORDS || records.length > MAX_RECORDS) {
    throw new RangeError(`주유 기록은 ${MIN_RECORDS}~${MAX_RECORDS}개가 필요합니다.`);
  }
  const todayDay = toDay(today)!;
  const rows = records.map((record) => {
    const day = toDay(record.date);
    if (day === null) throw new RangeError(`날짜 형식이 맞지 않습니다: ${record.date}`);
    if (day > todayDay) throw new RangeError("앞으로의 날짜는 주유 기록으로 넣을 수 없습니다.");
    if (todayDay - day > MAX_AGE_DAYS) throw new RangeError(`최근 ${MAX_AGE_DAYS}일 안의 기록만 씁니다.`);
    const won = record.won == null ? null : recordWon(record.won);
    const liters = record.liters == null ? null : isLiters(record.liters) ? record.liters : undefined;
    if (record.won != null && won === null) {
      throw new RangeError(
        `주유 금액은 ${RECORD_WON.min.toLocaleString()}~${RECORD_WON.max.toLocaleString()}원 사이로 넣어 주세요.`,
      );
    }
    if (liters === undefined) throw new RangeError(`주유량은 1~${MAX_LITERS}리터 사이 정수여야 합니다.`);
    if (won === null && liters === null) throw new RangeError("주유 금액을 넣어 주세요.");
    return { day, date: record.date, won, liters };
  });
  rows.sort((a, b) => a.day - b.day);
  for (let index = 1; index < rows.length; index++) {
    const gap = rows[index].day - rows[index - 1].day;
    if (gap === 0) throw new RangeError("같은 날짜의 기록이 두 번 있습니다.");
    if (gap > MAX_GAP_DAYS) throw new RangeError(`기록 사이가 ${MAX_GAP_DAYS}일보다 길면 계산하지 않습니다.`);
  }
  return rows;
}

export function forecastNextFill(records: FillRecord[], today = todayKst()) {
  const rows = cleanRecords(records, today);
  const first = rows[0];
  const last = rows.at(-1)!;
  const gaps = rows.slice(1).map((row, index) => row.day - rows[index].day);
  const avgGapDays = Math.round((last.day - first.day) / gaps.length);
  // 보통 넣는 양: 금액을 적은 기록은 금액 평균(천원 단위), 리터만 있는 기록은 리터 평균. 없으면 null.
  const wons = rows.map((row) => row.won).filter((won): won is number => won !== null);
  const liters = rows.map((row) => row.liters).filter((value): value is number => value !== null);
  const typicalWon =
    wons.length > 0
      ? Math.min(
          Math.max(Math.round(wons.reduce((a, b) => a + b, 0) / wons.length / 1000) * 1000, AMOUNT_LIMITS.minWon),
          AMOUNT_LIMITS.maxWon,
        )
      : null;
  const typicalLiters = liters.length > 0 ? Math.round(liters.reduce((a, b) => a + b, 0) / liters.length) : null;
  const nextDay = last.day + avgGapDays;
  const todayDay = toDay(today)!;
  const notifyOn = notifyDay(fromDay(nextDay), today);
  return {
    records: rows.map(({ date, won, liters }) => ({ date, won, liters })),
    gapsDays: gaps,
    avgGapDays,
    typicalWon,
    typicalLiters,
    lastDate: last.date,
    nextDate: fromDay(nextDay),
    nextWeekday: weekday(fromDay(nextDay)),
    notifyOn,
    notifyWeekday: weekday(notifyOn),
    // 예상일이 오늘이거나 이미 지났으면 지금 넣을 때다.
    due: nextDay <= todayDay,
    today,
    method: "지난 주유 간격의 평균을 마지막 주유일에 더함",
    note: "가격이 아니라 이용자의 주유 간격만 기록으로 셉니다. 기록이 쌓일수록 정확해집니다.",
  };
}

export type FillForecast = ReturnType<typeof forecastNextFill>;
