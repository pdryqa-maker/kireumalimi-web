"use client";

// 누를 때만 오피넷을 부르는 개인 점검: 단골 주유소(동네 평균·근처 더 싼 곳), 요소수 재고, 달별 시도 평균 비교.
// 내 기록 요약과 알림 탭의 '지금 점검'이 함께 쓴다.
import { josa, type FavoriteCheck, type UreaCheck } from "@/lib/conditions";
import { prefsQuery } from "@/lib/discounts";
import { prefsOf, type Profile } from "@/lib/profile";
import { ledgerForMonth } from "@/lib/savedLedger";
import type { VsArea } from "@/lib/savedVsArea";

const FAILED = "오피넷에서 가격을 받지 못했어요. 잠시 뒤 다시 눌러 주세요.";

export type FavoriteResult = FavoriteCheck & { monthlySaveWon?: number; notFound?: boolean };

// 서버 설정·오피넷 장애(502) 문구는 이용자에게 보이지 않고 정해진 안내를 쓴다. 입력 오류(400)나 한도(429) 문구는 그대로 보인다.
async function getJson(url: string, failed: string) {
  const response = await fetch(url).catch(() => null);
  const body = await response?.json().catch(() => null);
  const shown = response && response.status !== 502 && typeof body?.error === "string" ? body.error : failed;
  return { ok: Boolean(response?.ok), body, error: shown };
}

// 단골 주유소 점검. monthly(한 달에 넣는 양)가 있으면 더 싼 곳으로 바꿀 때 한 달에 덜 드는 돈도 셈한다.
export async function checkFavorite(name: string, profile: Profile, monthly: { liters: number } | null): Promise<FavoriteResult> {
  const params = new URLSearchParams({ name, fuel: profile.fuel, ...prefsQuery(prefsOf(profile)) });
  if (profile.area) params.set("area", profile.area.code);
  const { ok, body, error } = await getJson(`/api/stations/favorite?${params}`, FAILED);
  if (!ok) return { error };
  if (!body?.found) {
    return { error: `오피넷에서 '${name}'${josa(name, "을", "를")} 찾지 못했어요. 탐색의 주유소 점검에서 이름을 바꿔 찾아 보세요.`, notFound: true };
  }
  const standing = body.standing;
  if (!standing || typeof standing.error === "string") return { error: standing?.error ?? FAILED };
  const { station, areaAverage, nearby } = standing;
  if (!areaAverage) return { error: `${station.name}의 동네 평균가를 오피넷에서 받지 못했어요.` };
  const option = nearby?.cheaperOption ?? null;
  const cheaper = option
    ? { name: String(option.name), paidPrice: Number(option.paidPrice), discountWon: Number(option.discountWon) || 0, distanceKm: Number(option.distanceKm) }
    : null;
  const monthlySaveWon =
    cheaper && monthly ? Math.round((monthly.liters * (station.paidPrice - cheaper.paidPrice)) / 100) * 100 : undefined;
  return {
    fetchedAt: new Date().toISOString(),
    name: String(station.name),
    areaName: String(areaAverage.area),
    diffWon: Math.round(areaAverage.diffWon),
    cheaper,
    ...(monthlySaveWon ? { monthlySaveWon } : {}),
  };
}

// 요소수 재고: 집, 없으면 내 위치 근처. 둘 다 없으면 내 시도에서 가격 낮은 곳.
// 재고는 시도 단위로 받으므로 내 지역을 고르지 않았으면 부르지 않는다(다른 지역을 가정하지 않는다).
export async function checkUrea(profile: Profile): Promise<UreaCheck> {
  if (!profile.area) return { error: "요소수 재고는 시도 단위로 받아요. 위치 고르기에서 내 지역을 골라 주세요." };
  const origin = profile.home ?? profile.location;
  const params = new URLSearchParams({ sido: profile.area.code.slice(0, 2) });
  if (origin) {
    params.set("x", String(origin.x));
    params.set("y", String(origin.y));
    params.set("label", origin.label);
  }
  const { ok, body, error } = await getJson(`/api/stations/urea?${params}`, "요소수 재고를 받지 못했어요. 잠시 뒤 다시 눌러 주세요.");
  if (!ok || !Array.isArray(body?.stations)) return { error };
  const first = body.stations[0];
  return {
    fetchedAt: new Date().toISOString(),
    from: origin ? (profile.home ? "집" : origin.label) : null,
    station: first
      ? {
          name: String(first.name),
          distanceKm: typeof first.distanceKm === "number" ? first.distanceKm : null,
          pricePerLiter: typeof first.pricePerLiter === "number" ? first.pricePerLiter : null,
        }
      : null,
  };
}

// 한 달의 시도 평균 비교(/api/fuel-report). vsArea가 null이면 하나도 견주지 못한 것이다(평균이 없거나 오피넷을 못 불렀다).
export async function fetchVsArea(month: string, profile: Profile, fingerprint: string): Promise<VsArea> {
  const response = await fetch("/api/fuel-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ledger: ledgerForMonth(month), profile, month }),
  });
  if (!response.ok) throw new Error(String(response.status));
  const body = await response.json();
  const result = body?.vsArea;
  if (result !== null && typeof result?.savedWon !== "number") throw new Error("vsArea 없음");
  return result
    ? { fingerprint, area: String(result.area ?? ""), savedWon: result.savedWon, comparedFills: Number(result.comparedFills) || 0 }
    : { fingerprint, area: "", savedWon: 0, comparedFills: 0 };
}
