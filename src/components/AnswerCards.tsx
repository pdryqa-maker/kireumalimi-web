// 실질비용, 제도 변경 알림 미리보기, 가격 알림 조건 카드. 기존 카드와 같은 재질(솟은 카드, 눌린 태그)을 쓴다.
import type { AlertProposal } from "@/lib/chatbot";
import type { priceCapNotice, taxCutImpact } from "@/lib/policy";
import type { findByTotalCost } from "@/lib/stations";
import { koreanTime, longDate, monthDay, PUMP_NOTE, won } from "./format";

export type CostResult = Awaited<ReturnType<typeof findByTotalCost>>;
export type CostStation = CostResult["stations"][number];
export type TaxImpact = Exclude<ReturnType<typeof taxCutImpact>, { error: string }>;
export type CapNotice = Exclude<ReturnType<typeof priceCapNotice>, { error: string }>;
export type AlertStatus = "proposed" | "saved" | "unsaved" | "dismissed";
export type PriceRow = { id: string; name: string; brand: string; price: number };
export type AlertCheck = AlertProposal & { fetchedAt: string; matches: PriceRow[]; lowest: PriceRow | null };

const CARD = "max-w-[34rem] animate-rise rounded-3xl bg-ground p-5 shadow-raised";
const TAG = "rounded-full px-2.5 py-1 text-xs font-medium text-ink-soft tabular-nums shadow-inset-sm";
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
      <CardHead title={`${cost.place} 출발 · ${cost.fuel} ${cost.liters}L 실질비용`} fetchedAt={cost.fetchedAt} />
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
                  리터당 {won(station.price)}원 · 직선 {station.distanceKm}km · 오가는 연료비 {won(station.tripWon)}원
                </span>
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
          ? `가장 싼 ${cheapest.name}(리터당 ${won(cheapest.price)}원)은 ${cheapest.distanceKm}km 떨어져 있어, 거리까지 따지면 ${won(cost.extraForCheapestWon)}원 더 들어요.`
          : "가장 싼 곳이 거리까지 따져도 가장 덜 들어요."}
      </p>
      <p className="mt-2 text-xs text-ink-soft">
        {cost.liters}L, {cost.kmpl}km/L 기준으로 1km 더 가려면 리터당 약 {cost.breakEvenWonPerKm}원은 더 싸야 해요.
        거리는 직선거리라 실제 도로는 더 길어요. {PUMP_NOTE}
      </p>
    </div>
  );
}

export function TaxCard({ tax, cost }: { tax: TaxImpact; cost: CostResult | null }) {
  const best = cost?.stations[0];
  const message =
    `유류세 인하가 ${monthDay(tax.endsOn)}에 끝날 예정이에요. ${tax.fuel} ${tax.liters}L 기준 최대 ${won(tax.maxExtraWon)}원 더 들어요.` +
    (best && cost ? ` ${cost.place} 근처 추천: ${best.name}, 리터당 ${won(best.price)}원(거리까지 따져 가장 덜 들어요).` : "");
  return (
    <div className={CARD}>
      <CardHead title="제도 변경 알림 미리보기 · 유류세 인하" />
      <p className="mt-4 text-sm text-ink-soft">
        {longDate(tax.endsOn)} 인하가 끝나면 {tax.fuel} {tax.liters}L에
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">
        최대 {won(tax.maxExtraWon)}
        <span className="ml-0.5 text-base font-medium">원</span>
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        더 들어요 · 리터당 {tax.wonPerLiter}원(인하율 {tax.ratePct}%) · {monthDay(tax.decidedOn)} 정부 연장 결정
      </p>
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
        <figcaption className="text-xs text-ink-soft">
          카카오톡 채널이 열리면 종료 7일 전에 이렇게 보내요. 지금은 미리보기예요.
        </figcaption>
        <blockquote className="mt-2 rounded-2xl rounded-tl-md p-4 text-[15px] leading-relaxed shadow-raised-sm">
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
  kerosene,
  onPastNotice,
  busy,
}: {
  cap: CapNotice;
  kerosene: { name: string; href: string };
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
              : `${fuelLabel(cap.fuel)} 상한이 리터당 ${won(Math.abs(change))}원 ${change < 0 ? "내려" : "올라"}, ${cap.liters}L면 최대 ${won(cap.maxDiffWon ?? 0)}원 차이가 나요.`}
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
        <a
          href={kerosene.href}
          className="rounded-full px-4 py-2 text-sm text-ink-soft shadow-raised-sm active:shadow-inset-sm"
        >
          등유 가구 안내는 {kerosene.name}
        </a>
      </div>
      <figure className="mt-4">
        <figcaption className="text-xs text-ink-soft">
          카카오톡 채널이 열리면 발표 직후 이렇게 보내요. 지금은 미리보기예요.
        </figcaption>
        <blockquote className="mt-2 rounded-2xl rounded-tl-md p-4 text-[15px] leading-relaxed shadow-raised-sm">
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
        조건은 이 브라우저에만 저장하고, 확인할 때 오피넷 최저가와 맞춰 봐요. 카카오톡 채널이 열리면 조건에 닿을 때
        알려요.
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
