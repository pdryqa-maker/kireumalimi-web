"use client";

// 한 번에 넣는 양을 화면에서 리터로 바꾼다. 가득은 영수증(장부)으로 바로 셈하고,
// 금액은 서버(/api/fill)에서 오늘 전국 평균 판매가로 바꾼다. 같은 유종·금액은 한 번만 묻는다.
import { useEffect, useMemo, useState } from "react";
import { fullLiters, makeFill, type Amount, type Fill, type FullLiters } from "@/lib/fillAmount";
import { parseFills, fillStore } from "@/lib/savedFills";
import { ledgerStore, mergeLedger, parseLedger } from "@/lib/savedLedger";
import { useStored } from "./useStored";

// 가득일 때의 리터: 장부와 주유 기록으로 셈하고, 없으면 프로필의 기본값.
export function useFullLiters(fallback: number): FullLiters {
  const ledger = useStored(ledgerStore, parseLedger);
  const fills = useStored(fillStore, parseFills);
  return useMemo(() => fullLiters(mergeLedger(ledger, fills), fallback), [ledger, fills, fallback]);
}

const cache = new Map<string, Fill | null>();

async function loadFill(fuel: string, won: number): Promise<Fill | null> {
  const key = `${fuel}:${won}`;
  if (cache.has(key)) return cache.get(key)!;
  const response = await fetch(`/api/fill?${new URLSearchParams({ fuel, amount: String(won) })}`);
  const body = await response.json().catch(() => null);
  const fill: Fill | null = response.ok && body?.fill ? body.fill : null;
  // 평균가를 못 받은 결과는 남기지 않는다. 다음에 다시 묻는다.
  if (fill) cache.set(key, fill);
  return fill;
}

// 지금 고른 양을 리터로. 가득은 바로, 금액은 서버에 묻는다. 평균가를 못 받으면 null.
export async function fetchFill(fuel: string, amount: Amount, full: FullLiters): Promise<Fill | null> {
  if (amount === "full") return makeFill("full", full, null);
  return loadFill(fuel, amount).catch(() => null);
}

// fill이 null이면 아직 받는 중이거나 평균가를 못 받은 것이다(failed로 구분).
export function useFill(fuel: string, amount: Amount, full: FullLiters) {
  const key = amount === "full" ? "" : `${fuel}:${amount}`;
  const [loaded, setLoaded] = useState<{ key: string; fill: Fill | null } | null>(null);
  useEffect(() => {
    if (amount === "full") return;
    let alive = true;
    loadFill(fuel, amount)
      .then((fill) => alive && setLoaded({ key: `${fuel}:${amount}`, fill }))
      .catch(() => alive && setLoaded({ key: `${fuel}:${amount}`, fill: null }));
    return () => {
      alive = false;
    };
  }, [fuel, amount]);
  if (amount === "full") return { fill: makeFill("full", full, null), failed: false };
  const current = loaded?.key === key ? loaded : null;
  return { fill: current?.fill ?? null, failed: current !== null && current.fill === null };
}
