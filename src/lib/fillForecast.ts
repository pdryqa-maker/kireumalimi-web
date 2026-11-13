// 내 차 주유 예보. 주유 기록 두세 번의 간격으로 다음 주유일을 셈한다.
// 가격을 예측하지 않는다. 이용자 본인의 주유 간격만 기록으로 계산한다.
import { MAX_LITERS } from "./policy";

export type FillRecord = { date: string; liters: number };

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
export const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

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
    if (!Number.isInteger(record.liters) || record.liters < 1 || record.liters > MAX_LITERS) {
      throw new RangeError(`주유량은 1~${MAX_LITERS}리터 사이 정수여야 합니다.`);
    }
    return { day, date: record.date, liters: record.liters };
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
  const typicalLiters = Math.round(rows.reduce((sum, row) => sum + row.liters, 0) / rows.length);
  const nextDay = last.day + avgGapDays;
  const todayDay = toDay(today)!;
  // 예상일이 든 주의 월요일 아침에 한 번 알린다. 그 월요일이 이미 지났으면 오늘 알린다.
  const mondayOfWeek = nextDay - ((new Date(nextDay * DAY).getUTCDay() + 6) % 7);
  const notifyDay = Math.max(mondayOfWeek, todayDay);
  return {
    records: rows.map(({ date, liters }) => ({ date, liters })),
    gapsDays: gaps,
    avgGapDays,
    typicalLiters,
    lastDate: last.date,
    nextDate: fromDay(nextDay),
    nextWeekday: weekday(fromDay(nextDay)),
    notifyOn: fromDay(notifyDay),
    notifyWeekday: weekday(fromDay(notifyDay)),
    // 예상일이 오늘이거나 이미 지났으면 지금 넣을 때다.
    due: nextDay <= todayDay,
    today,
    method: "지난 주유 간격의 평균을 마지막 주유일에 더함",
    note: "가격이 아니라 이용자의 주유 간격만 기록으로 셉니다. 기록이 쌓일수록 정확해집니다.",
  };
}

export type FillForecast = ReturnType<typeof forecastNextFill>;
