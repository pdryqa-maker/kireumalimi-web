"use client";

// 내 정보와 주유 장부로 셈한 개인 값. 내 기록의 '내 맞춤 요약'과 알림 탭이 같은 숫자를 쓰도록 한 곳에서 셈한다.
// 오피넷은 금액→리터(/api/fill, 전국 평균)와 가득일 때의 내 지역 평균가(/api/briefing)만 부른다.
import type { Personal } from "@/lib/conditions";
import { fuelEconomy } from "@/lib/fuelEconomy";
import type { LedgerEntry } from "@/lib/ledger";
import {
  favoriteStation,
  fillCost,
  fillPlan,
  kmplTrend,
  monthlyLiters,
  monthProjection,
  planLiters,
  taxSchedule,
} from "@/lib/personal";
import type { Profile } from "@/lib/profile";
import { useAreaPrice } from "./useAreaPrice";
import { useFill, useFullLiters } from "./useFill";

export function usePersonal(profile: Profile, entries: LedgerEntry[], today: string | null, areaCode: string) {
  const fullTank = useFullLiters(profile.fullLiters);
  const { fill } = useFill(profile.fuel, profile.amount, fullTank);
  const areaPrice = useAreaPrice(profile.fuel, areaCode, profile.amount === "full");
  const economy = fuelEconomy(profile);
  const ureaNeeded = profile.fuel === "경유" && profile.ureaNeeded;
  if (!today) {
    const personal: Personal = {
      plan: null,
      cost: null,
      tax: null,
      projection: null,
      amount: profile.amount,
      monthlyKm: profile.monthlyKm,
      favoriteName: null,
      ureaNeeded,
    };
    return { fill, economy, plan: null, cost: null, tax: null, projection: null, favorite: null, monthly: null, trend: [], personal };
  }
  const liters = fill?.liters ?? null;
  const plan = fillPlan({
    entries,
    monthlyKm: profile.monthlyKm,
    kmpl: economy.kmpl,
    fillLiters: planLiters(profile.amount, fill, profile.fuel),
    today,
  });
  const cost = fillCost({ amount: profile.amount, fill, areaPrice, discounts: profile.discounts, excludeBrands: profile.excludeBrands });
  const tax = taxSchedule({ fuel: profile.fuel, plan, liters, today });
  // 한 번에 드는 돈: 예상 비용, 없으면 금액으로 넣는 사람은 그 금액, 그래도 없으면 기록의 평소 금액.
  const perFillWon = cost?.won ?? (profile.amount !== "full" ? profile.amount : null) ?? plan?.typicalWon ?? null;
  const projection = monthProjection({ entries, plan, perFillWon, today });
  const favorite = favoriteStation(entries, today);
  const monthly = monthlyLiters({ entries, today, monthlyKm: profile.monthlyKm, kmpl: economy.kmpl });
  const trend = kmplTrend(entries);
  const personal: Personal = {
    plan,
    cost,
    tax,
    projection,
    amount: profile.amount,
    monthlyKm: profile.monthlyKm,
    favoriteName: favorite?.name ?? null,
    ureaNeeded,
  };
  return { fill, economy, plan, cost, tax, projection, favorite, monthly, trend, personal };
}
