"use client";

// 내 지역 오늘 평균가(가득일 때의 예상 금액에 쓴다). 오늘·같은 유종·같은 지역 값이 이 브라우저에 있으면 그대로 쓰고,
// 없으면 /api/briefing을 한 번 불러 내 지역(없으면 전국) 평균을 남긴다. 실패하면 그 화면에서는 다시 부르지 않는다.
import { useEffect, useState } from "react";
import { browserStore } from "@/lib/browserStore";
import { todayKst } from "@/lib/fillForecast";
import type { AreaPrice } from "@/lib/personal";
import { useMounted, useStored } from "./useStored";

export const areaPriceStore = browserStore("kireumalimi.areaPrice", "null");

export function parseAreaPrice(raw: string): AreaPrice | null {
  try {
    const value = JSON.parse(raw);
    const ok =
      value &&
      typeof value.date === "string" &&
      typeof value.fuel === "string" &&
      typeof value.area === "string" &&
      typeof value.areaName === "string" &&
      typeof value.price === "number" &&
      value.price > 0 &&
      (value.scope === "local" || value.scope === "national");
    return ok ? value : null;
  } catch {
    return null;
  }
}

const inflight = new Set<string>();

export function useAreaPrice(fuel: string, areaCode: string, enabled = true): AreaPrice | null {
  const stored = useStored(areaPriceStore, parseAreaPrice);
  const mounted = useMounted();
  const today = mounted ? todayKst() : null;
  const fresh = stored && stored.date === today && stored.fuel === fuel && stored.area === areaCode ? stored : null;
  const key = `${fuel}|${areaCode}|${today}`;
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !today || fresh || failed === key || inflight.has(key)) return;
    inflight.add(key);
    let alive = true;
    fetch(`/api/briefing?${new URLSearchParams({ fuel, area: areaCode })}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body) => {
        const local = body?.local;
        const national = body?.national;
        const value: AreaPrice | null =
          local?.price > 0
            ? { date: today, fuel, area: areaCode, areaName: String(local.area), price: local.price, scope: "local" }
            : national?.price > 0
              ? { date: today, fuel, area: areaCode, areaName: "전국", price: national.price, scope: "national" }
              : null;
        if (!value) throw new Error("평균가 없음");
        areaPriceStore.write(value);
      })
      .catch(() => alive && setFailed(key))
      .finally(() => inflight.delete(key));
    return () => {
      alive = false;
    };
  }, [enabled, today, fresh, failed, key, fuel, areaCode]);
  return enabled ? fresh : null;
}
