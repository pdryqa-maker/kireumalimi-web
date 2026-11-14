// 주유소 카드와 알림 문구가 함께 쓰는 짧은 글: 할인 줄, 뺀 상표 안내, 주유 예보 문구.
import type { FillForecast } from "@/lib/fillForecast";
import type { CostResult } from "./AnswerCards";
import { dayWithWeekday, won } from "./format";

// 내 할인이 들어간 주유소: "오피넷 1,680원 · S-OIL 할인 −100원". 할인이 없으면 null.
export const discountLine = (station: { brand: string; price: number; discountWon?: number }) =>
  station.discountWon ? `오피넷 ${won(station.price)}원 · ${station.brand} 할인 −${won(station.discountWon)}원` : null;

// 뺀 상표 안내: 목록이 있으면 몇 곳 뺐는지, 비었으면 남은 곳이 없다고.
export const excludedNote = (excludedCount: number | undefined, empty: boolean, radiusKm?: number) =>
  !excludedCount
    ? null
    : empty
      ? `뺀 상표를 빼니 ${radiusKm ? `반경 ${radiusKm}km 안에 ` : ""}남은 곳이 없어요(${excludedCount}곳 뺌).`
      : `뺀 상표 ${excludedCount}곳은 넣지 않았어요.`;

// 주유 예보 알림 문구. 추천은 할인 반영 가격으로 고른 곳이라 그 가격을 쓰고, 할인이 있으면 오피넷 가격과 할인액을 함께 밝힌다.
export function forecastMessage(forecast: Pick<FillForecast, "nextDate">, cost: CostResult | null) {
  const best = cost?.stations[0];
  const discount = best ? discountLine(best) : null;
  const empty = cost && !best ? excludedNote(cost.excludedCount, true) : null;
  return (
    `${dayWithWeekday(forecast.nextDate)}쯤 주유할 때예요.` +
    (best && cost
      ? ` ${cost.place} 근처 추천: ${best.name}, 리터당 ${won(best.paidPrice)}원(${discount ? `${discount}, ` : ""}거리까지 따져 가장 덜 들어요).`
      : empty
        ? ` ${empty}`
        : "") +
    " 알림 받는 날 가격으로 다시 골라 드려요."
  );
}
