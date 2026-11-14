"use client";

// 실질비용, 출퇴근 길, 제도 변경 알림 미리보기, 가격 알림 조건 카드. 기존 카드와 같은 재질(솟은 카드, 눌린 태그)을 쓴다.
import { useState } from "react";
import type { AlertProposal, DashboardProposal, FillProposal } from "@/lib/chatbot";
import type { Fill } from "@/lib/fillAmount";
import { MAX_ODOMETER_KM } from "@/lib/ledger";
import type { priceCapNotice, taxCutImpact } from "@/lib/policy";
import type { findByTotalCost, findCommute } from "@/lib/stations";
import { koreanTime, longDate, monthDay, PUMP_NOTE, won } from "./format";
import { discountLine, excludedNote } from "./stationText";

export type CostResult = Awaited<ReturnType<typeof findByTotalCost>>;
export type CommuteResult = Awaited<ReturnType<typeof findCommute>>;

export { discountLine, excludedNote };
export type CostStation = CostResult["stations"][number];
// 제도 금액은 한 번에 넣는 양(fill)으로 셈한다. 금액을 리터로 바꿀 평균가를 못 받으면 fill이 null이고 리터당 금액만 보여 준다.
export type TaxImpact = Exclude<ReturnType<typeof taxCutImpact>, { error: string }> & { fill: Fill | null };
export type CapNotice = Exclude<ReturnType<typeof priceCapNotice>, { error: string }> & { fill: Fill | null };

// "5만원어치(약 27L)" 다음에 붙는 말: 금액이면 어떤 가격으로 리터를 셈했는지, 가득이면 어떤 리터인지.
export function fillBasis(fill: Fill) {
  if (fill.pricePerLiter && fill.priceBasis) return `리터는 ${fill.priceBasis} ${won(fill.pricePerLiter)}원으로 셈했어요.`;
  return fill.fullBasis ?? "";
}
export type AlertStatus = "proposed" | "saved" | "unsaved" | "dismissed";
export type PriceRow = { id: string; name: string; brand: string; price: number };
export type AlertCheck = AlertProposal & { fetchedAt: string; matches: PriceRow[]; lowest: PriceRow | null };

const CARD = "max-w-[34rem] animate-rise rounded-3xl bg-ground p-5 shadow-raised";
const TAG = "rounded-full px-2.5 py-1 text-xs font-medium text-ink-soft tabular-nums shadow-inset-sm";
const FIELD =
  "min-w-0 rounded-full bg-transparent px-3.5 py-2 text-[15px] tabular-nums shadow-inset-sm focus-visible:outline-offset-1";
const PRIMARY =
  "rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-raised-sm disabled:opacity-50";
const SECONDARY = "rounded-full px-4 py-2 text-sm text-ink-soft shadow-raised-sm active:shadow-inset-sm disabled:opacity-50";

export type FillMark = { full: boolean; odometerKm: number | null };

// 누적 주행거리 입력값. 비었으면 null, 맞지 않으면 undefined.
function odometerFrom(text: string): number | null | undefined {
  if (text.trim() === "") return null;
  const km = Number(text);
  return Number.isInteger(km) && km > 0 && km <= MAX_ODOMETER_KM ? km : undefined;
}
const ROW =
  "-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-3 text-left transition-shadow hover:shadow-inset-sm active:shadow-inset disabled:cursor-default disabled:hover:shadow-none";

function CardHead({ title, fetchedAt }: { title: string; fetchedAt?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-ink-soft">{title}</h2>
      {fetchedAt && <span className={TAG}>{koreanTime(fetchedAt)} 조회</span>}
    </div>
  );
}

export function CostCard({
  cost,
  onDetail,
  busy,
}: {
  cost: CostResult;
  onDetail: (station: CostStation) => void;
  busy: boolean;
}) {
  const { cheapest } = cost;
  return (
    <div className={CARD}>
      <CardHead title={`${cost.place} 출발 · ${cost.fuel} ${cost.fill.label} 실질비용`} fetchedAt={cost.fetchedAt} />
      <p className="mt-1 text-xs text-ink-soft">
        기름값에 오가는 연료비(연비 {cost.kmpl}km/L, 직선 왕복)를 더한 총비용 순 · 반경 {cost.radiusKm}km
      </p>
      <ol className="mt-2 divide-y divide-hairline">
        {cost.stations.map((station, rank) => (
          <li key={station.id}>
            <button
              type="button"
              onClick={() => onDetail(station)}
              disabled={busy}
              aria-label={`${station.name} 총비용 ${won(station.totalWon)}원, 자세히 보기`}
              className={ROW}
            >
              <span className="w-4 shrink-0 text-sm text-ink-soft tabular-nums">{rank + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {station.name} <span className="text-sm font-normal text-ink-soft">{station.brand}</span>
                </span>
                <span className="block text-xs text-ink-soft tabular-nums">
                  리터당 {won(station.paidPrice)}원 · 직선 {station.distanceKm}km · 오가는 연료비 {won(station.tripWon)}원
                </span>
                {discountLine(station) && <span className="block text-xs text-ink-soft tabular-nums">{discountLine(station)}</span>}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xl font-bold tabular-nums">
                  {won(station.totalWon)}
                  <span className="ml-0.5 text-sm font-medium">원</span>
                </span>
                <span className="block text-xs font-medium text-ink-soft">총비용</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[15px] leading-relaxed">
        {cheapest && cost.extraForCheapestWon > 0
          ? `가장 싼 ${cheapest.name}(리터당 ${won(cheapest.paidPrice)}원)은 ${cheapest.distanceKm}km 떨어져 있어, 거리까지 따지면 ${won(cost.extraForCheapestWon)}원 더 들어요.`
          : "가장 싼 곳이 거리까지 따져도 가장 덜 들어요."}
      </p>
      {excludedNote(cost.excludedCount, false) && <p className="mt-2 text-sm">{excludedNote(cost.excludedCount, false)}</p>}
      <p className="mt-2 text-xs text-ink-soft">
        {cost.fill.label}, {cost.kmpl}km/L 기준으로 1km 더 가려면 리터당 약 {cost.breakEvenWonPerKm}원은 더 싸야 해요.
        같은 양을 넣을 때를 비교했어요. {fillBasis(cost.fill)} 거리는 직선거리라 실제 도로는 더 길어요. {PUMP_NOTE}
      </p>
    </div>
  );
}

type CommuteStation = CommuteResult["overlap"][number];

function CommuteRow({ station, note }: { station: CommuteStation; note: string }) {
  const discount = discountLine(station);
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          {station.name} <span className="text-sm font-normal text-ink-soft">{station.brand}</span>
        </span>
        <span className="block text-xs text-ink-soft tabular-nums">{note}</span>
        {discount && <span className="block text-xs text-ink-soft tabular-nums">{discount}</span>}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xl font-bold tabular-nums">
          {won(station.paidPrice)}
          <span className="ml-0.5 text-sm font-medium">원</span>
        </span>
        <span className="block text-xs font-medium text-ink-soft">리터당</span>
      </span>
    </li>
  );
}

// 출퇴근 길: 집과 회사 반경에 모두 드는 주유소를 두 거리의 합이 짧은 순으로. 없으면 집 근처·회사 근처 한 곳씩.
export function CommuteCard({ commute }: { commute: CommuteResult }) {
  const { overlap, nearHome, nearWork, radiusKm } = commute;
  const empty = overlap.length === 0 && !nearHome && !nearWork;
  return (
    <div className={CARD}>
      <CardHead title={`출퇴근 길 · 집 ${commute.home} ↔ 회사 ${commute.work} · ${commute.fuel}`} fetchedAt={commute.fetchedAt} />
      <p className="mt-1 text-xs text-ink-soft">
        {overlap.length > 0
          ? `집과 회사에서 모두 반경 ${radiusKm}km 안인 곳, 두 거리의 합이 짧은 순`
          : `집과 회사 반경 ${radiusKm}km에 함께 드는 곳이 없어 따로 골랐어요`}
      </p>
      {empty ? (
        <p className="mt-3 text-[15px] leading-relaxed">
          {excludedNote(commute.excludedCount, true, radiusKm) ?? `집과 회사 반경 ${radiusKm}km 안에서 가격을 알린 곳이 없어요.`}
        </p>
      ) : (
        <ol className="mt-1 divide-y divide-hairline">
          {overlap.map((station) => (
            <CommuteRow key={station.id} station={station} note={`집 ${station.homeKm}km + 회사 ${station.workKm}km`} />
          ))}
          {nearHome && <CommuteRow station={nearHome} note={`집 근처 · 직선 ${nearHome.homeKm}km`} />}
          {nearWork && <CommuteRow station={nearWork} note={`회사 근처 · 직선 ${nearWork.workKm}km`} />}
        </ol>
      )}
      {!empty && excludedNote(commute.excludedCount, false) && <p className="mt-2 text-sm">{excludedNote(commute.excludedCount, false)}</p>}
      <p className="mt-3 text-xs text-ink-soft">거리는 직선이라 실제 길은 다를 수 있어요. {PUMP_NOTE}</p>
    </div>
  );
}

export function TaxCard({ tax, cost }: { tax: TaxImpact; cost: CostResult | null }) {
  const best = cost?.stations[0];
  const extra =
    tax.fill && tax.maxExtraWon !== null
      ? `${tax.fuel} ${tax.fill.label}를 넣는 데 최대 ${won(tax.maxExtraWon)}원 더 들어요.`
      : `${tax.fuel}는 리터당 최대 ${won(tax.wonPerLiter)}원 더 들어요.`;
  const message =
    `유류세 인하가 ${monthDay(tax.endsOn)}에 끝날 예정이에요. ${extra}` +
    (best && cost ? ` ${cost.place} 근처 추천: ${best.name}, 리터당 ${won(best.price)}원(거리까지 따져 가장 덜 들어요).` : "");
  return (
    <div className={CARD}>
      <CardHead title="제도 변경 알림 미리보기 · 유류세 인하" />
      <p className="mt-4 text-sm text-ink-soft">
        {longDate(tax.endsOn)} 인하가 끝나면 {tax.fuel} {tax.fill && tax.maxExtraWon !== null ? `${tax.fill.label}에` : "리터당"}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">
        최대 {won(tax.fill && tax.maxExtraWon !== null ? tax.maxExtraWon : tax.wonPerLiter)}
        <span className="ml-0.5 text-base font-medium">원</span>
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        더 들어요 · 리터당 {tax.wonPerLiter}원(인하율 {tax.ratePct}%) · {monthDay(tax.decidedOn)} 정부 연장 결정
      </p>
      {tax.fill && tax.maxExtraWon !== null && <p className="mt-1 text-xs text-ink-soft">{fillBasis(tax.fill)}</p>}
      {best && cost && (
        <dl className="mt-4 rounded-2xl px-4 py-3 shadow-inset-sm">
          <dt className="text-xs text-ink-soft">{cost.place} 출발, 거리까지 따져 가장 덜 드는 곳</dt>
          <dd className="mt-1 font-semibold">
            {best.name} <span className="text-sm font-normal text-ink-soft">{best.brand}</span>
          </dd>
          <dd className="text-sm tabular-nums">
            리터당 {won(best.price)}원 · 직선 {best.distanceKm}km · {koreanTime(cost.fetchedAt)} 조회
          </dd>
        </dl>
      )}
      <figure className="mt-4">
        <blockquote className="rounded-2xl rounded-tl-md p-4 text-[15px] leading-relaxed shadow-raised-sm">
          {message}
        </blockquote>
      </figure>
      <p className="mt-3 text-xs text-ink-soft">
        출처: {tax.source}. 판매가가 한 번에 오르지 않을 수 있어 최대값이에요. 정부가 다시 연장하면 바뀌어요.
      </p>
    </div>
  );
}

// 화면에는 실내등유를 등유로 줄여 쓴다.
export const fuelLabel = (fuel: string) => (fuel === "실내등유" ? "등유" : fuel);

function changeText(changeWon: number | null, previousRound: number | null) {
  if (changeWon === null || previousRound === null) return "직전 차수 없음";
  if (changeWon === 0) return `${previousRound}차와 같음`;
  return `${previousRound}차보다 ${won(Math.abs(changeWon))}원 ${changeWon < 0 ? "인하" : "인상"}`;
}

export function capMessage(cap: CapNotice) {
  const rows = cap.fuels
    .map((item) => `${fuelLabel(item.fuel)} ${won(item.capWon)}원(${changeText(item.changeWon, cap.previousRound)})`)
    .join(", ");
  return `${cap.round}차 석유 최고가격이 ${monthDay(cap.startsOn)}부터 적용돼요. ${rows}. 정유사 공급가의 상한이라, 주유소 판매가는 따로 정해져요.`;
}

export function CapCard({
  cap,
  onPastNotice,
  busy,
}: {
  cap: CapNotice;
  onPastNotice: () => void;
  busy: boolean;
}) {
  const change = cap.changeWon;
  return (
    <div className={CARD}>
      <CardHead title={`제도 변경 해설 · ${cap.round}차 석유 최고가격`} />
      <p className="mt-3 text-sm text-ink-soft">
        {monthDay(cap.announcedOn)} 발표 · {monthDay(cap.startsOn)}부터 적용
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        {cap.fuels.map((item) => (
          <div key={item.fuel} className={`rounded-2xl px-3 py-3 shadow-inset-sm ${item.fuel === cap.fuel ? "ring-2 ring-flame" : ""}`}>
            <dt className="text-xs text-ink-soft">{fuelLabel(item.fuel)}</dt>
            <dd className="mt-1 text-lg font-bold whitespace-nowrap tabular-nums sm:text-xl">
              {won(item.capWon)}
              <span className="ml-0.5 text-sm font-medium">원</span>
            </dd>
            <dd className="text-xs text-ink-soft tabular-nums">{changeText(item.changeWon, cap.previousRound)}</dd>
          </div>
        ))}
      </dl>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed marker:text-ink-soft">
        <li>최고가격은 정유사가 주유소에 넘기는 공급가의 상한이에요. 주유소 판매가의 상한은 아니에요.</li>
        <li>
          {change === null
            ? `${fuelLabel(cap.fuel)} 상한을 비교할 직전 차수 정보가 없어요.`
            : change === 0
              ? `${fuelLabel(cap.fuel)} 상한은 ${cap.previousRound}차와 같아요. 이번 고시로 공급가 상한이 바뀌지 않았어요.`
              : `${fuelLabel(cap.fuel)} 상한이 리터당 ${won(Math.abs(change))}원 ${change < 0 ? "내려" : "올라"}` +
                (cap.fill && cap.maxDiffWon !== null ? `, ${cap.fill.label}면 최대 ${won(cap.maxDiffWon)}원 차이가 나요.` : "요.")}
        </li>
        <li>판매가에 언제 얼마나 반영될지는 주유소마다 달라요. 지난 고시 때 우리 동네가 어떻게 움직였는지 볼 수 있어요.</li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onPastNotice}
          disabled={busy}
          className="rounded-full px-4 py-2 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm disabled:opacity-50"
        >
          지난 고시 뒤 우리 동네는?
        </button>
      </div>
      <figure className="mt-4">
        <blockquote className="rounded-2xl rounded-tl-md p-4 text-[15px] leading-relaxed shadow-raised-sm">
          {capMessage(cap)}
        </blockquote>
      </figure>
      <p className="mt-3 text-xs text-ink-soft">
        출처: {cap.source}({cap.checkedOn} 확인). 앞으로의 판매가를 예측한 값이 아니에요.
      </p>
    </div>
  );
}

const STATUS_TEXT: Record<Exclude<AlertStatus, "proposed">, string> = {
  saved: "이 브라우저에 저장했어요",
  unsaved: "이 브라우저에 저장하지 못했어요",
  dismissed: "저장하지 않았어요",
};

export function AlertCard({
  alert,
  status,
  onSave,
  onDismiss,
  busy,
}: {
  alert: AlertProposal;
  status: AlertStatus;
  onSave: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  return (
    <div className={CARD}>
      <CardHead title="가격 알림 조건 확인" />
      <p className="mt-3 text-xl font-bold">
        {alert.areaName} {alert.fuel} <span className="tabular-nums">{won(alert.belowWon)}</span>
        <span className="ml-0.5 text-sm font-medium">원 이하</span>
      </p>
      <p className="mt-1 text-sm text-ink-soft">이 지역 최저가가 이 가격 이하가 되면 알려요.</p>
      {status === "proposed" ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm disabled:opacity-50"
          >
            이 조건으로 저장
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm text-ink-soft shadow-raised-sm active:shadow-inset-sm disabled:opacity-50"
          >
            저장 안 함
          </button>
        </div>
      ) : (
        <p className={`mt-4 w-fit ${TAG}`}>{STATUS_TEXT[status]}</p>
      )}
      <p className="mt-3 text-xs text-ink-soft">
        조건은 이 브라우저에만 저장하고, 확인할 때 오피넷 최저가와 맞춰 봐요.
      </p>
    </div>
  );
}

export function AlertCheckCard({ check }: { check: AlertCheck }) {
  const { matches, lowest } = check;
  return (
    <div className={CARD}>
      <CardHead title={`${check.areaName} ${check.fuel} ${won(check.belowWon)}원 이하 알림`} fetchedAt={check.fetchedAt} />
      {matches.length > 0 ? (
        <>
          <p className="mt-3 text-2xl font-bold tabular-nums">
            {matches.length}
            <span className="ml-0.5 text-sm font-medium">곳{matches.length >= 5 ? " 이상" : ""}</span>
          </p>
          <p className="text-sm text-ink-soft">조건에 맞는 주유소가 있어요. 실제 서비스라면 지금 알림이 가요.</p>
          <ol className="mt-2 divide-y divide-hairline">
            {matches.map((station) => (
              <li key={station.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="font-semibold">
                  {station.name} <span className="text-sm font-normal text-ink-soft">{station.brand}</span>
                </span>
                <span className="shrink-0 text-lg font-bold tabular-nums">
                  {won(station.price)}
                  <span className="ml-0.5 text-sm font-medium">원</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <p className="mt-3 font-semibold">아직 조건에 맞는 곳이 없어요.</p>
          {lowest && (
            <p className="mt-1 text-[15px] tabular-nums">
              지금 가장 싼 곳은 {lowest.name}, 리터당 {won(lowest.price)}원이에요.
            </p>
          )}
        </>
      )}
      <p className="mt-3 text-xs text-ink-soft">{PUMP_NOTE}</p>
    </div>
  );
}

const FILL_STATUS_TEXT: Record<Exclude<AlertStatus, "proposed">, string> = {
  saved: "주유 기록에 넣었어요",
  unsaved: "이 브라우저에 저장하지 못했어요",
  dismissed: "기록에 넣지 않았어요",
};

// 영수증 사진에서 읽은 주유 기록. 이용자가 확인하고 넣는다. 가득 넣었는지와 계기판 누적 주행거리를 함께 받아
// 가득→가득 실측 연비를 셈한다. 같은 날 계기판 사진을 먼저 올렸으면 그 주행거리를 채워 둔다.
export function FillProposalCard({
  fill,
  status,
  odometerHint,
  onSave,
  onDismiss,
  busy,
}: {
  fill: FillProposal;
  status: AlertStatus;
  odometerHint: number | null;
  onSave: (mark: FillMark) => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const [full, setFull] = useState(false);
  const [odometer, setOdometer] = useState<string | null>(null);
  const [error, setError] = useState("");
  const odometerText = odometer ?? (odometerHint ? String(odometerHint) : "");
  function save() {
    const odometerKm = odometerFrom(odometerText);
    if (odometerKm === undefined) {
      setError(`누적 주행거리는 1~${won(MAX_ODOMETER_KM)}km 사이 정수로 넣거나 비워 두세요.`);
      return;
    }
    onSave({ full, odometerKm });
  }
  const rounded = fill.litersOnReceipt !== fill.liters;
  const rows: [string, string][] = [
    ["주유한 날", longDate(fill.date)],
    ["넣은 양", `${fill.litersOnReceipt}L${rounded ? ` (기록은 ${fill.liters}L)` : ""}`],
    ...(fill.pricePerLiter ? ([["리터당", `${won(fill.pricePerLiter)}원`]] as [string, string][]) : []),
    ...(fill.totalWon ? ([["결제 금액", `${won(fill.totalWon)}원`]] as [string, string][]) : []),
    ...(fill.stationName ? ([["주유소", fill.stationName]] as [string, string][]) : []),
  ];
  return (
    <div className={CARD}>
      <CardHead title="영수증에서 읽은 주유 기록" />
      <dl className="mt-3 divide-y divide-hairline">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-sm text-ink-soft">{label}</dt>
            <dd className="text-right font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {status === "proposed" ? (
        <>
          <div className="mt-3 space-y-2.5">
            <label className="flex w-fit items-center gap-2 text-sm">
              <input type="checkbox" checked={full} onChange={(event) => setFull(event.target.checked)} className="size-4 accent-accent" />
              가득 넣었어요
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-soft">계기판 누적 주행거리</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_ODOMETER_KM}
                step={1}
                value={odometerText}
                onChange={(event) => {
                  setOdometer(event.target.value);
                  setError("");
                }}
                placeholder="모르면 비워 두세요"
                className={`${FIELD} w-40`}
              />
              <span className="text-ink-soft">km</span>
            </label>
            <p className="text-xs leading-relaxed text-ink-soft">
              가득 넣을 때마다 주행거리를 남기면 두 번째부터 실제 연비(달린 거리 ÷ 넣은 양)를 셈해요.
              {odometerHint && odometer === null ? " 오늘 계기판 사진의 주행거리를 채워 뒀어요." : ""}
            </p>
            {error && (
              <p role="alert" className="text-sm font-medium">
                {error}
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={save} disabled={busy} className={PRIMARY}>
              주유 기록에 넣기
            </button>
            <button type="button" onClick={onDismiss} disabled={busy} className={SECONDARY}>
              넣지 않기
            </button>
          </div>
        </>
      ) : (
        <p className={`mt-4 w-fit ${TAG}`}>{FILL_STATUS_TEXT[status]}</p>
      )}
      <p className="mt-3 text-xs text-ink-soft">
        값이 다르면 넣지 말고 다시 찍어 주세요. 사진은 저장하지 않고, 기록은 이 브라우저에만 최근 5번까지 남겨요.
      </p>
    </div>
  );
}

const KMPL_STATUS_TEXT: Record<Exclude<AlertStatus, "proposed">, string> = {
  saved: "내 연비를 바꿨어요",
  unsaved: "이 브라우저에 저장하지 못했어요",
  dismissed: "내 연비를 바꾸지 않았어요",
};
const ODOMETER_STATUS_TEXT: Record<Exclude<AlertStatus, "proposed">, string> = {
  saved: "오늘 주유 기록에 넣었어요",
  unsaved: "이 브라우저에 저장하지 못했어요",
  dismissed: "주유 기록에 넣지 않았어요",
};

// 계기판 사진에서 읽은 누적 주행거리와 평균 연비. 평균 연비는 이 자리에서 바로 내 연비로 쓸 수 있고(로그인하지 않아도 이 브라우저에 남는다),
// 주행거리는 그날 주유 기록에 붙여 가득→가득 실측 연비에 쓴다. 그날 기록이 없으면 영수증 카드에 채워 준다.
export function DashboardCard({
  dashboard,
  kmplStatus,
  odometerStatus,
  current,
  hasFill,
  onUseKmpl,
  onSaveOdometer,
  busy,
}: {
  dashboard: DashboardProposal;
  kmplStatus: AlertStatus;
  odometerStatus: AlertStatus;
  current: { kmpl: number; basis: string };
  hasFill: boolean;
  onUseKmpl: () => void;
  onSaveOdometer: (full: boolean) => void;
  busy: boolean;
}) {
  const [full, setFull] = useState(false);
  const rows: [string, string][] = [
    ...(dashboard.odometerKm ? ([["누적 주행거리", `${won(dashboard.odometerKm)}km`]] as [string, string][]) : []),
    ...(dashboard.averageKmpl ? ([["평균 연비", `${dashboard.averageKmpl}km/L`]] as [string, string][]) : []),
  ];
  return (
    <div className={CARD}>
      <CardHead title="계기판에서 읽은 값" />
      <dl className="mt-3 divide-y divide-hairline">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-sm text-ink-soft">{label}</dt>
            <dd className="text-right font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {dashboard.averageKmpl !== null && (
        <div className="mt-4">
          <p className="text-sm leading-relaxed">
            지금 내 연비는 <span className="font-semibold tabular-nums">{current.kmpl}km/L</span>예요
            <span className="text-ink-soft">({current.basis})</span>.
          </p>
          {kmplStatus === "proposed" ? (
            <button type="button" onClick={onUseKmpl} disabled={busy} className={`mt-2.5 ${PRIMARY}`}>
              평균 연비 {dashboard.averageKmpl}km/L를 내 연비로 쓰기
            </button>
          ) : (
            <p className={`mt-2.5 w-fit ${TAG}`}>{KMPL_STATUS_TEXT[kmplStatus]}</p>
          )}
        </div>
      )}

      {dashboard.odometerKm !== null && (
        <div className="mt-4">
          {odometerStatus !== "proposed" ? (
            <p className={`w-fit ${TAG}`}>{ODOMETER_STATUS_TEXT[odometerStatus]}</p>
          ) : hasFill ? (
            <>
              <label className="flex w-fit items-center gap-2 text-sm">
                <input type="checkbox" checked={full} onChange={(event) => setFull(event.target.checked)} className="size-4 accent-accent" />
                오늘 가득 넣었어요
              </label>
              <button type="button" onClick={() => onSaveOdometer(full)} disabled={busy} className={`mt-2.5 ${SECONDARY}`}>
                주행거리를 오늘 주유 기록에 넣기
              </button>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-ink-soft">
              오늘 주유 기록이 아직 없어요. 영수증 사진을 올리면 영수증 카드에 이 주행거리를 채워 둘게요.
            </p>
          )}
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        평균 연비는 계기판을 마지막으로 초기화한 뒤의 평균이에요. 값이 다르면 쓰지 말고 다시 찍어 주세요. 사진은 저장하지 않아요.
      </p>
    </div>
  );
}
