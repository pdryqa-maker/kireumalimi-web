"use client";

// 첫 화면의 오늘의 기름 소식. 오피넷 평균가(내 지역, 전국)가 어제보다 얼마나 움직였는지와
// 정부가 발표한 일정(석유 최고가격 고시, 유류세 인하 종료)을 함께 보여 준다. 뉴스 기사는 쓰지 않는다.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FuelBriefing } from "@/lib/briefing";
import { addDays, daysBetween } from "@/lib/fillForecast";
import { FUEL_TAX_CUT, PRICE_CAP } from "@/lib/policy";
import { fuelName } from "@/lib/profile";
import { dayWithWeekday, koreanTime, monthDay, won } from "./format";
import { BellIcon, CalendarIcon, PinIcon, PumpIcon, ReceiptIcon } from "./icons";

const LOAD_ERROR = "가격 소식을 불러오지 못했어요.";

export type BriefingState = { key: string; data: FuelBriefing | null; error: string };

export function useBriefing(fuel: string, area: string | null, enabled: boolean) {
  const key = `${fuel}|${area ?? ""}`;
  const [state, setState] = useState<BriefingState | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const params = new URLSearchParams(area ? { fuel, area } : { fuel });
    fetch(`/api/briefing?${params}`)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (alive) setState(response.ok && body ? { key, data: body, error: "" } : { key, data: null, error: body?.error ?? LOAD_ERROR });
      })
      .catch(() => {
        if (alive) setState({ key, data: null, error: LOAD_ERROR });
      });
    return () => {
      alive = false;
    };
  }, [key, fuel, area, enabled]);
  // 유종이나 지역을 바꾸면 새 값이 올 때까지 이전 값을 보여 주지 않는다.
  return state?.key === key ? state : null;
}

// 어제 대비 움직임. 오피넷 평균가는 소수 둘째 자리까지 오므로 0.1원 단위로 보여 준다.
const amount = (diff: number) => Math.round(Math.abs(diff) * 10) / 10;
const moved = (diff: number) =>
  amount(diff) === 0 ? "어제와 같아요" : `어제보다 ${won(amount(diff))}원 ${diff > 0 ? "올랐어요" : "내렸어요"}`;

// 인사 대신 보여 줄 오늘의 첫 소식. 날짜가 정해진 제도 변화가 가까우면 그것부터, 아니면 내 지역 평균가 움직임.
export function newsHeadline(today: string, fuel: string, briefing: FuelBriefing | null): string | null {
  const cap = PRICE_CAP.rounds.at(-1)!;
  if (today >= cap.announcedOn && today < cap.startsOn) {
    const when = cap.startsOn === addDays(today, 1) ? "내일" : monthDay(cap.startsOn);
    return `${when}부터 ${cap.round}차 석유 최고가격이 적용돼요`;
  }
  if (today === cap.startsOn) return `오늘부터 ${cap.round}차 석유 최고가격이 적용돼요`;
  const left = daysBetween(today, FUEL_TAX_CUT.endsOn);
  if (left >= 0 && left <= 14) return left === 0 ? "유류세 인하는 오늘까지예요" : `유류세 인하가 ${left}일 남았어요`;
  const local = briefing?.local ?? (briefing?.national ? { ...briefing.national, area: "전국" } : null);
  if (!local) return null;
  return `오늘 ${local.area} ${fuelName(fuel)} 평균 가격은 ${moved(local.diff)}`;
}

type Row = { Icon: (props: { className?: string }) => React.ReactNode; label: string; value: string; note: string; href?: string };

function priceRow(Icon: Row["Icon"], area: string, fuel: string, price: number, diff: number): Row {
  return { Icon, label: `${area} ${fuelName(fuel)} 평균`, value: `${won(Math.round(price))}원`, note: moved(diff) };
}

function policyRows(today: string, fuel: string): Row[] {
  const cap = PRICE_CAP.rounds.at(-1)!;
  const capWon = cap.prices[fuel];
  const left = daysBetween(today, FUEL_TAX_CUT.endsOn);
  const tax = FUEL_TAX_CUT.fuels[fuel];
  return [
    {
      Icon: CalendarIcon,
      label: `${cap.round}차 석유 최고가격`,
      value: today < cap.startsOn ? `${dayWithWeekday(cap.startsOn)}부터 적용` : `${monthDay(cap.startsOn)}부터 적용 중`,
      note: capWon ? `${fuelName(fuel)} 공급가 상한 ${won(capWon)}원` : "휘발유, 경유, 실내등유가 대상이에요",
    },
    {
      Icon: ReceiptIcon,
      label: FUEL_TAX_CUT.name,
      value: left >= 0 ? `${dayWithWeekday(FUEL_TAX_CUT.endsOn)}까지` : `${monthDay(FUEL_TAX_CUT.endsOn)}에 끝났어요`,
      note:
        left < 0
          ? "정부가 다시 정하면 고쳐요"
          : `${left === 0 ? "오늘까지예요" : `${left}일 남았어요`}${tax ? `. 끝나면 리터당 ${won(tax.wonPerLiter)}원 다시 붙어요` : ""}`,
    },
  ];
}

function Skeleton() {
  return (
    <li aria-hidden="true" className="flex gap-2.5 bg-ground px-3.5 py-3 sm:gap-3 sm:px-4">
      <div className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 space-y-2 py-0.5">
        <div className="groove h-2.5 w-2/5" />
        <div className="groove h-3.5 w-1/3" />
        <div className="groove h-2.5 w-3/5" />
      </div>
    </li>
  );
}

export function FuelNews({
  today,
  fuel,
  state,
  notice,
}: {
  today: string;
  fuel: string;
  state: BriefingState | null;
  notice: string | null;
}) {
  const data = state?.data ?? null;
  const prices: Row[] = [];
  if (data?.local) prices.push(priceRow(PinIcon, data.local.area, fuel, data.local.price, data.local.diff));
  if (data?.national) prices.push(priceRow(PumpIcon, "전국", fuel, data.national.price, data.national.diff));
  const rows: Row[] = [
    ...prices,
    ...policyRows(today, fuel),
    ...(notice ? [{ Icon: BellIcon, label: "내 알림", value: notice, note: "내 알림 조건에서 바꿀 수 있어요", href: "/alerts" }] : []),
  ];

  return (
    <section aria-labelledby="fuel-news" className="mt-7 overflow-hidden rounded-2xl shadow-raised-sm">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-3">
        <h2 id="fuel-news" className="text-sm font-semibold">
          오늘의 기름 소식
        </h2>
        <p className="text-xs text-ink-soft tabular-nums">{data ? `${koreanTime(data.fetchedAt)} 오피넷` : ""}</p>
      </div>
      <ul className="grid grid-cols-2 gap-px border-t border-hairline bg-hairline">
        {state === null && (
          <>
            <Skeleton />
            <Skeleton />
          </>
        )}
        {rows.map(({ Icon, label, value, note, href }) => {
          const body = (
            <>
              <Icon className="mt-0.5 size-4 shrink-0 text-flame" />
              <div className="min-w-0">
                <p className="text-xs text-ink-soft">{label}</p>
                <p className="mt-0.5 text-[15px] font-semibold tabular-nums">{value}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{note}</p>
              </div>
            </>
          );
          return (
            <li key={label} className="bg-ground last:odd:col-span-2">
              {href ? (
                <Link href={href} className="flex h-full gap-2.5 px-3.5 py-3 hover:bg-canvas sm:gap-3 sm:px-4">
                  {body}
                </Link>
              ) : (
                <div className="flex h-full gap-2.5 px-3.5 py-3 sm:gap-3 sm:px-4">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {state?.error && <p className="border-t border-hairline px-4 py-2.5 text-xs text-ink-soft">{state.error}</p>}
      <p className="border-t border-hairline px-4 py-2.5 text-xs leading-relaxed text-ink-soft">
        평균 가격은 1시간마다 새로 받아요. 최고가격과 유류세는 정부 발표 기준이에요({monthDay(PRICE_CAP.checkedOn)} 확인).
      </p>
    </section>
  );
}
