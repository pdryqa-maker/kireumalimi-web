// 화면에 숫자와 시각을 보여 주는 공통 형식.
export const PUMP_NOTE = "오피넷에 보고된 가격이라 주유소 현장 가격과 다를 수 있어요.";

export const won = (price: number) => price.toLocaleString("ko-KR");

// "2026-11-11 07:10" → "11월 11일 07:10 기준"
export function basis(updatedAt: string | null) {
  if (!updatedAt) return "기준 시각 없음";
  const [date, time] = updatedAt.split(" ");
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일 ${time} 기준`;
}

// ISO 시각 → "11월 11일 20:31" (한국 시간)
export function koreanTime(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}월 ${parts.day}일 ${parts.hour}:${parts.minute}`;
}

// "2026-07-01" → "7월 1일"
export function monthDay(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일`;
}

// "2027-01-31" → "2027년 1월 31일"
export function longDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}
