"use client";

// 내 알림 조건 화면. 일반 이용자가 조건을 미리 걸어 두면, 조건에 맞을 때만 알려 준다.
// 시제품은 알림을 보내지 않고, 지금 조건으로 받게 될 알림과 보내는 때를 미리 보여 준다.
import Link from "next/link";
import { useEffect, useState } from "react";
import { buildNotices, kstClock, RULES, scheduleNotices, type Planned, type PriceCheck } from "@/lib/conditions";
import { addDays } from "@/lib/fillForecast";
import { FUEL_TAX_CUT, PRICE_CAP } from "@/lib/policy";
import { addAlert, alertStore, MAX_ALERTS, parseAlerts, removeAlert, type SavedAlert } from "@/lib/savedAlerts";
import { fillStore, parseFills, saveFills } from "@/lib/savedFills";
import { fuelName, signedIn } from "@/lib/profile";
import { parseWatch, saveWatch, watchStore, type Watch } from "@/lib/watchSettings";
import { FillLogCard } from "./FillCards";
import { dayWithWeekday, koreanTime, monthDay, won } from "./format";
import { useMounted, useProfile, useStored } from "./useStored";

const SELECT =
  "appearance-none rounded-full bg-ground py-1.5 pr-8 pl-3.5 text-sm font-semibold shadow-inset-sm focus-visible:outline-offset-1";
const BUTTON = "rounded-full px-4 py-2 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm disabled:opacity-50";
const MIN_WON = 500;
const MAX_WON = 3000;

const PRICE_FUELS = ["휘발유", "경유", "자동차부탄"];

type Area = { code: string; name: string };
// 내 지역이 없을 때 처음 보여 줄 지역(시연 지역)
const DEFAULT_AREA: Area = { code: "1831", name: "울산 울주군" };

// 오피넷 지역 목록. sido를 비우면 시도, 시도 코드를 주면 그 시도의 시군구.
async function loadAreas(sido = ""): Promise<Area[]> {
  const response = await fetch(`/api/areas${sido ? `?sido=${sido}` : ""}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.areas)) throw new Error();
  return body.areas;
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute right-2.5 size-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <span className="relative flex items-center">
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={SELECT}>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
      <Chevron />
    </span>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-flame" : "bg-hairline"}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 left-1 size-6 rounded-full bg-ground shadow-sm transition-transform ${checked ? "translate-x-6" : ""}`}
      />
    </button>
  );
}

function whenLabel(plan: Planned, today: string) {
  if (plan.now) return "지금";
  if (plan.sendOn === today) return `오늘 아침 ${RULES.quietTo}시`;
  if (plan.sendOn === addDays(today, 1)) return `내일 아침 ${RULES.quietTo}시`;
  return `${dayWithWeekday(plan.sendOn)} 아침 ${RULES.quietTo}시`;
}

async function fetchPrices(alerts: SavedAlert[]) {
  const groups = new Map<string, SavedAlert[]>();
  for (const alert of alerts) {
    const key = `${alert.fuel}|${alert.area}`;
    groups.set(key, [...(groups.get(key) ?? []), alert]);
  }
  const checks: Record<string, PriceCheck> = {};
  await Promise.all(
    [...groups.values()].map(async (list) => {
      const { fuel, area } = list[0];
      try {
        const response = await fetch(`/api/stations/cheapest?${new URLSearchParams({ fuel, area })}`);
        const body = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(body?.stations)) throw new Error(body?.error);
        const stations: { name: string; price: number }[] = body.stations;
        for (const alert of list) {
          checks[alert.id] = {
            fetchedAt: body.fetchedAt,
            matches: stations.filter((station) => station.price <= alert.belowWon),
            lowest: stations[0] ?? null,
          };
        }
      } catch (problem) {
        const error = problem instanceof Error && problem.message ? problem.message : "가격을 불러오지 못했어요.";
        for (const alert of list) checks[alert.id] = { error };
      }
    }),
  );
  return checks;
}

export default function AlertsManager() {
  const watch = useStored(watchStore, parseWatch);
  const alerts = useStored(alertStore, parseAlerts);
  const fills = useStored(fillStore, parseFills);
  const profile = useProfile();
  const mounted = useMounted();
  const car = { fuel: profile.fuel, liters: profile.liters };
  const [checks, setChecks] = useState<Record<string, PriceCheck>>({});
  const [checking, setChecking] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const [fuelChoice, setPriceFuel] = useState<string | null>(null);
  const priceFuel = fuelChoice ?? (PRICE_FUELS.includes(profile.fuel) ? profile.fuel : PRICE_FUELS[0]);
  // 가격 조건 지역: 전국 시도·시군구에서 고른다. 처음에는 내 지역(없으면 울산 울주군)을 골라 둔다.
  const [picked, setPicked] = useState<Area | null>(null);
  const area = picked ?? (mounted && profile.area ? profile.area : DEFAULT_AREA);
  const sidoCode = area.code.slice(0, 2);
  const [sidos, setSidos] = useState<Area[] | null>(null);
  const [sigunLists, setSigunLists] = useState<Record<string, Area[]>>({});
  const [areaError, setAreaError] = useState(false);
  useEffect(() => {
    let alive = true;
    loadAreas()
      .then((list) => alive && setSidos(list))
      .catch(() => alive && setAreaError(true));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (sigunLists[sidoCode]) return;
    let alive = true;
    loadAreas(sidoCode)
      .then((list) => alive && setSigunLists((current) => ({ ...current, [sidoCode]: list })))
      .catch(() => alive && setAreaError(true));
    return () => {
      alive = false;
    };
  }, [sidoCode, sigunLists]);
  const sidoName = sidos?.find((sido) => sido.code === sidoCode)?.name ?? area.name.split(" ")[0];
  const siguns = sigunLists[sidoCode] ?? [];
  const sidoOptions: [string, string][] = sidos ? sidos.map((sido) => [sido.code, sido.name]) : [[sidoCode, sidoName]];
  const sigunOptions: [string, string][] = [
    ["", `${sidoName} 전체`],
    ...(siguns.length > 0
      ? siguns.map((sigun): [string, string] => [sigun.code, sigun.name])
      : area.code.length === 4
        ? [[area.code, area.name.replace(`${sidoName} `, "")] as [string, string]]
        : []),
  ];
  const chooseSido = (code: string) => setPicked({ code, name: sidos?.find((sido) => sido.code === code)?.name ?? code });
  const chooseSigun = (code: string) => {
    const sigun = siguns.find((item) => item.code === code);
    setPicked(sigun ? { code, name: `${sidoName} ${sigun.name}` } : { code: sidoCode, name: sidoName });
  };
  const [belowWon, setBelowWon] = useState("");
  const [priceError, setPriceError] = useState("");

  const change = (next: Partial<Watch>) => saveWatch({ ...watch, ...next });
  const latestCap = PRICE_CAP.rounds.at(-1)!;
  const full = alerts.length >= MAX_ALERTS;

  function addPrice(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(belowWon);
    if (!Number.isInteger(value) || value < MIN_WON || value > MAX_WON) {
      setPriceError(`가격은 ${won(MIN_WON)}~${won(MAX_WON)}원 사이 정수로 넣어 주세요.`);
      return;
    }
    if (!addAlert({ fuel: priceFuel, area: area.code, areaName: area.name, belowWon: value })) {
      setPriceError("이 브라우저에 저장하지 못했어요. 개인 정보 보호 모드인지 확인해 주세요.");
      return;
    }
    setBelowWon("");
    setPriceError("");
  }

  async function checkPrices() {
    setChecking(true);
    setChecks(await fetchPrices(alerts));
    setChecking(false);
  }

  // 오늘 날짜와 지금 시각은 브라우저에서만 읽는다(서버에서 미리 그릴 때 시각이 굳지 않게).
  const today = mounted ? kstClock().today : "";
  const notices = mounted ? buildNotices({ watch, car, alerts, checks, fills, today }) : [];
  const planned = mounted ? scheduleNotices(notices) : [];
  const waiting = notices.filter((notice) => !planned.some((plan) => plan.id === notice.id));

  return (
    <div className="mx-auto w-full max-w-xl pt-4 pb-10">
      <section aria-labelledby="alerts-title">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="flame-orb size-12 shrink-0" />
          <div>
            <h1 id="alerts-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
              내 알림 조건
            </h1>
            <p className="mt-1 text-ink-soft">조건에 맞을 때만 알려 드려요. 가격을 매번 찾아보지 않아도 돼요.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-canvas px-4 py-3">
          <span className="text-sm">
            <span className="font-semibold">내 차</span>{" "}
            <span className="text-ink-soft tabular-nums">
              {fuelName(car.fuel)} · 한 번에 {car.liters}L
            </span>
          </span>
          <span className="text-xs text-ink-soft">제도 알림의 금액을 이 기준으로 셈해요.</span>
          <Link href="/login" className="ml-auto text-sm font-semibold underline underline-offset-4">
            {mounted && signedIn(profile) ? "내 정보 바꾸기" : "로그인해서 맞추기"}
          </Link>
        </div>

        <h2 className="mt-8 text-base font-semibold">가격 조건</h2>
        <form onSubmit={addPrice} className="mt-2.5 flex flex-wrap items-center gap-2.5" aria-label="가격 조건 추가">
          <Select label="가격 조건 유종" value={priceFuel} options={PRICE_FUELS.map((fuel) => [fuel, fuelName(fuel)])} onChange={setPriceFuel} />
          <Select label="가격 조건 시도" value={sidoCode} options={sidoOptions} onChange={chooseSido} />
          <Select label="가격 조건 시군구" value={area.code.length === 4 ? area.code : ""} options={sigunOptions} onChange={chooseSigun} />
          <span className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              required
              min={MIN_WON}
              max={MAX_WON}
              placeholder="1650"
              value={belowWon}
              aria-label="이 가격 이하가 되면 알림(원)"
              onChange={(event) => {
                setBelowWon(event.target.value);
                setPriceError("");
              }}
              className="w-24 min-w-0 rounded-full bg-transparent px-3.5 py-1.5 text-right text-[15px] tabular-nums shadow-inset-sm focus-visible:outline-offset-1"
            />
            <span className="text-sm">원 이하</span>
          </span>
          <button type="submit" disabled={full} className={`${BUTTON} bg-accent text-on-accent`}>
            조건 추가
          </button>
        </form>
        {priceError && (
          <p role="alert" className="mt-2 text-sm font-medium">
            {priceError}
          </p>
        )}
        <p className="mt-2 text-xs text-ink-soft">
          {full
            ? `가격 조건은 ${MAX_ALERTS}개까지예요. 하나를 지우면 더 넣을 수 있어요.`
            : `전국 어느 지역이나 걸 수 있어요. 오피넷 가격 기준이에요. 최대 ${MAX_ALERTS}개.`}
          {areaError && " 지역 목록을 불러오지 못해 지금 지역만 고를 수 있어요."}
        </p>
        {mounted && alerts.length > 0 && (
          <ul className="mt-3 space-y-2.5">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex items-center gap-2.5 rounded-2xl bg-canvas px-4 py-3">
                <span className="flex-1 font-semibold">
                  {alert.areaName} {alert.fuel} <span className="tabular-nums">{won(alert.belowWon)}</span>원 이하
                </span>
                <button
                  type="button"
                  onClick={() => removeAlert(alert.id)}
                  className="rounded-full px-3.5 py-1.5 text-sm text-ink-soft shadow-raised-sm active:shadow-inset-sm"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-8 text-base font-semibold">제도·예보 조건</h2>
        <ul className="mt-1 divide-y divide-hairline border-b border-hairline">
          <li className="flex items-start gap-4 py-4">
            <div className="flex-1">
              <p className="font-semibold">석유 최고가격 새 고시 발표 직후</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
                공급가 상한이 바뀌면 내 {fuelName(car.fuel)} {car.liters}L에서 최대 얼마 달라지는지 알려요. 지금은 {latestCap.round}차 고시
                기준이에요.
              </p>
            </div>
            <Switch label="석유 최고가격 새 고시 알림" checked={mounted && watch.cap} onChange={(cap) => change({ cap })} />
          </li>
          <li className="flex items-start gap-4 py-4">
            <div className="flex-1">
              <p className="font-semibold">유류세 인하 종료 {RULES.taxLeadDays}일 전</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
                {monthDay(FUEL_TAX_CUT.endsOn)} 종료 예정이에요. 끝나면 내 주유량에서 최대 얼마 더 드는지 미리 알려요.
              </p>
            </div>
            <Switch label="유류세 인하 종료 알림" checked={mounted && watch.tax} onChange={(tax) => change({ tax })} />
          </li>
          <li className="flex items-start gap-4 py-4">
            <div className="flex-1">
              <p className="font-semibold">내 차 주유 예보</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
                주유 기록으로 다음 주유일을 셈해, 그 주 월요일 아침에 알려요.{" "}
                {mounted && (fills.length > 0 ? `저장한 기록 ${fills.length}번.` : "저장한 기록이 없어요.")}
              </p>
              <button type="button" onClick={() => setFillOpen(!fillOpen)} aria-expanded={fillOpen} className={`${BUTTON} mt-2.5`}>
                {fillOpen ? "기록 닫기" : mounted && fills.length > 0 ? "기록 고치기" : "기록 넣기"}
              </button>
            </div>
            <Switch label="내 차 주유 예보 알림" checked={mounted && watch.forecast} onChange={(forecast) => change({ forecast })} />
          </li>
        </ul>
        {fillOpen && (
          <div className="mt-4">
            <FillLogCard
              busy={false}
              onSubmit={(forecast) => {
                saveFills(forecast.records);
                change({ forecast: true });
                setFillOpen(false);
              }}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="plan-title" className="mt-10">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="plan-title" className="flex-1 text-xl font-bold tracking-tight">
            받을 알림
          </h2>
          {mounted && alerts.length > 0 && (
            <button type="button" onClick={checkPrices} disabled={checking} className={`${BUTTON} bg-accent text-on-accent`}>
              {checking ? "점검 중…" : "가격 지금 점검"}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          밤 {RULES.quietFrom - 12}시~아침 {RULES.quietTo}시에는 보내지 않아요 · 같은 알림은 한 번만 · 하루 {RULES.dailyMax}건까지
        </p>

        {mounted && notices.length === 0 && (
          <p className="mt-5 rounded-2xl bg-canvas px-4 py-4 text-center text-sm text-ink-soft">
            위에서 조건을 걸면, 받게 될 알림이 여기에 나와요.
          </p>
        )}

        {planned.length > 0 && (
          <ol className="mt-5 space-y-5">
            {planned.map((plan) => (
              <li key={plan.id}>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{whenLabel(plan, today)}</span>
                  <span className="text-sm text-ink-soft">{plan.title}</span>
                </p>
                {plan.reason && <p className="mt-0.5 text-xs text-ink-soft">{plan.reason}</p>}
                <blockquote className="mt-2 rounded-2xl rounded-tl-md p-4 text-[15px] leading-relaxed shadow-raised-sm">
                  {plan.message}
                  <span className="mt-2 block text-xs text-ink-soft">알림 끄기: 기름알리미 › 내 알림 조건</span>
                </blockquote>
              </li>
            ))}
          </ol>
        )}

        {waiting.length > 0 && (
          <>
            <h3 className="mt-7 text-sm font-semibold text-ink-soft">조건을 기다리는 중</h3>
            <ul className="mt-2.5 space-y-2.5">
              {waiting.map((notice) => (
                <li key={notice.id} className="rounded-2xl bg-canvas px-4 py-3">
                  <p className="font-semibold">{notice.title}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">{notice.state}</p>
                </li>
              ))}
            </ul>
          </>
        )}

        {checks && Object.values(checks).some((check) => "fetchedAt" in check) && (
          <p className="mt-4 text-xs text-ink-soft">
            가격은 {koreanTime(Object.values(checks).find((check) => "fetchedAt" in check)!.fetchedAt as string)}에 오피넷에서
            확인했어요. 오피넷에 보고된 가격이라 현장 가격과 다를 수 있어요.
          </p>
        )}
        <p className="mt-5 text-xs leading-relaxed text-ink-soft">
          지금은 알림을 보내지 않고 받을 알림을 미리 보여 줘요. 조건은 이 브라우저에만 저장하고, 보내는 길은 카카오톡 채널로 제안해요.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/" className="rounded-full px-5 py-2.5 text-ink-soft shadow-raised-sm active:shadow-inset-sm">
          주유 챗봇으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
