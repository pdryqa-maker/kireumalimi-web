// '내 알림 조건'에서 켜 둔 제도·예보 조건. 가격 조건은 savedAlerts, 내 차 정보는 profile에 따로 저장한다.
import { browserStore } from "./browserStore";

export type Watch = {
  tax: boolean; // 유류세 인하 종료 7일 전
  cap: boolean; // 최고가격 새 고시 발표 직후
  forecast: boolean; // 내 차 주유 예보
  monthly: boolean; // 매달 25일 월말 예상 지출
  favorite: boolean; // 단골 주유소가 동네 평균보다 30원 이상 비쌀 때
  urea: boolean; // 요소수 재고(요소수가 필요한 경유차만)
};

export const watchStore = browserStore("kireumalimi.watch", "{}");

export function parseWatch(raw: string): Watch {
  let value: Partial<Watch> = {};
  try {
    value = JSON.parse(raw) ?? {};
  } catch {}
  return {
    tax: value.tax === true,
    cap: value.cap === true,
    forecast: value.forecast === true,
    monthly: value.monthly === true,
    favorite: value.favorite === true,
    urea: value.urea === true,
  };
}

export const saveWatch = (watch: Watch) => watchStore.write(watch);
