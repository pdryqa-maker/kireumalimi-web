"use client";

// 내 차 주유 예보: 주유 기록을 받는 카드와, 다음 주유 예상일·알림 미리보기 카드.
import { useState } from "react";
import {
  forecastNextFill,
  MAX_RECORDS,
  MIN_RECORDS,
  RECORD_WON,
  todayKst,
  type FillForecast,
  type FillRecord,
} from "@/lib/fillForecast";
import { wonName } from "@/lib/fillAmount";
import type { FuelReport } from "@/lib/fuelReport";
import { loadFills } from "@/lib/savedFills";
import type { CostResult } from "./AnswerCards";
import { dayWithWeekday, koreanTime, monthDay, won } from "./format";
import { discountLine, excludedNote, forecastMessage } from "./stationText";

const CARD = "max-w-[34rem] animate-rise rounded-3xl bg-ground p-5 shadow-raised";
const FIELD =
  "min-w-0 rounded-full bg-transparent px-3.5 py-2 text-[15px] tabular-nums shadow-inset-sm focus-visible:outline-offset-1";
const BUTTON = "rounded-full px-4 py-2 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm disabled:opacity-50";

// 금액(won)으로 받는다. 영수증이나 예전 기록처럼 리터만 있는 줄은 리터를 그대로 두고 보여 준다.
type Row = { date: string; won: string; liters: number | null };

// 빈 줄. 예시 금액은 값이 아니라 안내 글(placeholder)로만 보여 준다. 예시가 내 기록으로 저장되지 않게 한다.
const EMPTY_ROW: Row = { date: "", won: "", liters: null };
const WON_HINT = "50000";

// 저장한 기록이 없으면 빈 줄 3개로 시작한다.
function initialRows(): { rows: Row[]; empty: boolean } {
  const saved = loadFills();
  if (saved.length >= MIN_RECORDS) {
    return {
      rows: saved.map((record) => ({ date: record.date, won: record.won ? String(record.won) : "", liters: record.liters ?? null })),
      empty: false,
    };
  }
  return { rows: [EMPTY_ROW, EMPTY_ROW, EMPTY_ROW], empty: true };
}

// 금액을 비워 두면 그 줄의 리터(영수증 기록)를 쓴다.
const toRecord = (row: Row): FillRecord =>
  row.won.trim() !== "" ? { date: row.date, won: Number(row.won) } : { date: row.date, liters: row.liters };

export function FillLogCard({ onSubmit, busy }: { onSubmit: (forecast: FillForecast) => void; busy: boolean }) {
  const [{ rows, empty }, setState] = useState(initialRows);
  const [error, setError] = useState("");
  const today = todayKst();

  const update = (next: Row[]) => {
    setState({ rows: next, empty: false });
    setError("");
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const records: FillRecord[] = rows.map(toRecord);
    try {
      onSubmit(forecastNextFill(records, today));
    } catch (problem) {
      setError(problem instanceof RangeError ? problem.message : "기록을 확인하지 못했어요.");
    }
  }

  return (
    <form onSubmit={submit} className={CARD} aria-label="주유 기록 입력">
      <h2 className="text-sm font-semibold text-ink-soft">내 차 주유 예보 · 주유 기록</h2>
      <p className="mt-2 text-[15px] leading-relaxed">
        최근에 주유한 날짜와 금액을 {MIN_RECORDS}~{MAX_RECORDS}번 넣어 주세요. 기록 사이 간격으로 다음 주유일을 셈해요.
      </p>
      {empty && <p className="mt-1 text-xs text-ink-soft">넣은 날짜와 금액을 적어 주세요.</p>}
      <ul className="mt-3 space-y-2.5">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-2">
            <input
              type="date"
              required
              max={today}
              value={row.date}
              aria-label={`${index + 1}번째 주유 날짜`}
              onChange={(event) => update(rows.map((item, at) => (at === index ? { ...item, date: event.target.value } : item)))}
              className={`${FIELD} flex-1 px-3`}
            />
            <span className="relative flex shrink-0 items-center">
              <input
                type="number"
                required={row.liters === null}
                inputMode="numeric"
                min={RECORD_WON.min}
                max={RECORD_WON.max}
                value={row.won}
                placeholder={row.liters !== null ? `${row.liters}L` : WON_HINT}
                aria-label={`${index + 1}번째 주유 금액(원)${row.liters !== null ? `, 비워 두면 ${row.liters}리터` : ""}`}
                onChange={(event) =>
                  update(rows.map((item, at) => (at === index ? { ...item, won: event.target.value } : item)))
                }
                className={`${FIELD} w-[6.5rem] pr-7 text-right`}
              />
              <span aria-hidden="true" className="pointer-events-none absolute right-3 text-sm text-ink-soft">
                원
              </span>
            </span>
            <button
              type="button"
              onClick={() => update(rows.filter((_, at) => at !== index))}
              disabled={rows.length <= MIN_RECORDS}
              aria-label={`${index + 1}번째 기록 빼기`}
              className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft shadow-raised-sm active:shadow-inset-sm disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 12h12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={`${BUTTON} bg-accent text-on-accent`}>
          다음 주유일 계산
        </button>
        {rows.length < MAX_RECORDS && (
          <button type="button" onClick={() => update([...rows, EMPTY_ROW])} disabled={busy} className={BUTTON}>
            기록 추가
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-soft">기록은 이 브라우저에만 저장해요.</p>
    </form>
  );
}

export function ForecastCard({ forecast, cost }: { forecast: FillForecast; cost: CostResult | null }) {
  const best = cost?.stations[0];
  return (
    <div className={CARD}>
      <h2 className="text-sm font-semibold text-ink-soft">내 차 주유 예보</h2>
      <p className="mt-4 text-sm text-ink-soft tabular-nums">
        기록 {forecast.records.length}번 · 평균 {forecast.avgGapDays}일마다
        {forecast.typicalWon !== null
          ? ` · 보통 ${wonName(forecast.typicalWon)}`
          : forecast.typicalLiters !== null
            ? ` · 보통 ${forecast.typicalLiters}L`
            : ""}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">
        {dayWithWeekday(forecast.nextDate)}
        <span className="ml-1 text-base font-medium">쯤</span>
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {forecast.due ? "예상일이 오늘이거나 지났어요. 지금쯤 넣을 때예요." : "다음 주유 예상일이에요."}
      </p>
      {best && cost && (
        <dl className="mt-4 rounded-2xl px-4 py-3 shadow-inset-sm">
          <dt className="text-xs text-ink-soft">
            {cost.place} 출발 {cost.fuel} {cost.fill.label}, 거리까지 따져 가장 덜 드는 곳(지금 가격)
          </dt>
          <dd className="mt-1 font-semibold">
            {best.name} <span className="text-sm font-normal text-ink-soft">{best.brand}</span>
          </dd>
          <dd className="text-sm tabular-nums">
            리터당 {won(best.paidPrice)}원 · 직선 {best.distanceKm}km · {koreanTime(cost.fetchedAt)} 조회
          </dd>
          {discountLine(best) && <dd className="text-xs text-ink-soft tabular-nums">{discountLine(best)}</dd>}
          {excludedNote(cost.excludedCount, false) && <dd className="mt-1 text-xs text-ink-soft">{excludedNote(cost.excludedCount, false)}</dd>}
        </dl>
      )}
      {cost && !best && excludedNote(cost.excludedCount, true) && (
        <p className="mt-4 rounded-2xl px-4 py-3 text-sm shadow-inset-sm">{excludedNote(cost.excludedCount, true)}</p>
      )}
      <figure className="mt-4">
        <blockquote className="rounded-2xl rounded-tl-md p-4 text-[15px] leading-relaxed shadow-raised-sm">
          {forecastMessage(forecast, cost)}
        </blockquote>
      </figure>
      <p className="mt-3 text-xs text-ink-soft">
        가격이 아니라 내 주유 간격만 기록으로 셈해요. 기록이 쌓일수록 정확해져요.
      </p>
    </div>
  );
}

const signed = (value: number, unit: string, more: string, less: string) =>
  `${won(Math.abs(value))}${unit} ${value >= 0 ? more : less}`;

// 대화 기록에 남길 리포트 요약. 다음 자유 질문에서 AI가 이 값을 이어 쓴다.
export function reportSummary(report: FuelReport) {
  if (report.fills === 0) return `${report.monthLabel} 주유 리포트: 이 달 주유 기록 없음.`;
  const noLiters = report.litersUnknownFills === report.fills;
  const parts = [
    `${report.monthLabel} 주유 리포트(${report.fuel}, 연비 ${report.kmpl}km/L): 주유 ${report.fills}번, ` +
      (noLiters ? "넣은 양 모름" : `${report.liters}L`) +
      (report.litersUnknownFills > 0 && !noLiters ? `(양을 모르는 주유 ${report.litersUnknownFills}번 뺌)` : ""),
    report.totalWon !== null ? `쓴 돈 ${won(report.totalWon)}원` : "쓴 돈 모름",
    noLiters ? "추정 주행 모름" : `추정 주행 ${won(report.estimatedKm)}km`,
  ];
  if (report.wonPerKm !== null) parts.push(`km당 ${report.wonPerKm}원`);
  if (report.vsArea) parts.push(`그날 ${report.vsArea.area} 평균 대비 ${signed(report.vsArea.savedWon, "원", "아낌", "더 씀")}`);
  return `${parts.join(", ")}.`;
}

export function ReportCard({ report, onReceipt }: { report: FuelReport; onReceipt: () => void }) {
  const prev = report.previous;
  // 금액만 적은 주유뿐이면 넣은 양과 주행거리를 모른다.
  const noLiters = report.litersUnknownFills === report.fills;
  return (
    <div className={CARD}>
      <h2 className="text-sm font-semibold text-ink-soft">
        내 주유 리포트 · {report.monthLabel} · {report.fuel}
      </h2>
      {report.fills === 0 ? (
        <>
          <p className="mt-3 text-[15px] leading-relaxed">
            {report.monthLabel}에는 아직 주유 기록이 없어요. 영수증 사진을 보내면 날짜, 양, 단가가 기록되고 이 리포트에 모여요.
          </p>
          {prev && (
            <p className="mt-2 text-sm text-ink-soft tabular-nums">
              {prev.monthLabel}: 주유 {prev.fills}번 · {prev.liters}L
              {prev.totalWon !== null && ` · ${won(prev.totalWon)}원`}
            </p>
          )}
          <button type="button" onClick={onReceipt} className={`${BUTTON} mt-4 bg-accent text-on-accent`}>
            영수증 사진 고르기
          </button>
        </>
      ) : (
        <>
          <p className="mt-4 text-xs text-ink-soft">이 달 쓴 기름값</p>
          <p className="mt-0.5 text-3xl font-bold tabular-nums">
            {report.totalWon !== null ? `${won(report.totalWon)}원` : "금액 모름"}
          </p>
          {report.wonUnknownFills > 0 && (
            <p className="mt-1 text-xs text-ink-soft">금액을 모르는 주유 {report.wonUnknownFills}번은 빼고 더했어요.</p>
          )}
          {report.litersUnknownFills > 0 && (
            <p className="mt-1 text-xs text-ink-soft">
              금액만 적은 주유 {report.litersUnknownFills}번은 넣은 양과 추정 주행에서 빠졌어요. 영수증 사진을 보내면 리터까지 기록돼요.
            </p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 tabular-nums">
            {[
              ["주유", `${report.fills}번`],
              ["넣은 양", noLiters ? "모름" : `${report.liters}L`],
              ["추정 주행", noLiters ? "모름" : `약 ${won(report.estimatedKm)}km`],
              ["1km당 기름값", report.wonPerKm !== null ? `${report.wonPerKm}원` : "모름"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl px-4 py-3 shadow-inset-sm">
                <dt className="text-xs text-ink-soft">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {report.vsArea && (
            <p className="mt-4 text-[15px] leading-relaxed">
              영수증 단가를 그날 {report.vsArea.area} 평균 판매가와 비교하면{" "}
              <strong className="font-semibold">{signed(report.vsArea.savedWon, "원", "아꼈어요", "더 썼어요")}</strong>
              <span className="text-sm text-ink-soft">(단가를 아는 {report.vsArea.comparedFills}번 기준)</span>
            </p>
          )}
          {prev && (
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {prev.monthLabel}보다{" "}
              {prev.litersDiff !== null ? signed(prev.litersDiff, "L", "더 넣었고", "덜 넣었고") : "넣은 양은 다 알지 못해 비교하지 않았고"}
              {prev.wonDiff !== null ? `, 기름값은 ${signed(prev.wonDiff, "원", "더 썼어요", "덜 썼어요")}.` : ", 지난달 금액은 다 알지 못해 비교하지 않았어요."}
            </p>
          )}
          <ol className="mt-4 divide-y divide-hairline text-sm">
            {report.entries.map((entry) => {
              const compared = report.vsArea?.fills.find((item) => item.date === entry.date);
              return (
                <li key={entry.date} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="tabular-nums">{dayWithWeekday(entry.date)}</span>
                    {entry.stationName && <span className="ml-2 text-ink-soft">{entry.stationName}</span>}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {[entry.liters !== null ? `${entry.liters}L` : null, entry.paidWon !== null ? `${won(entry.paidWon)}원` : null]
                      .filter(Boolean)
                      .join(" · ")}
                    {compared && (
                      <span className="block text-xs text-ink-soft">
                        {compared.averageDate === entry.date ? "그날" : `${monthDay(compared.averageDate)}`} 평균보다 리터당{" "}
                        {signed(compared.diffWon, "원", "비쌈", "쌈")}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <p className="mt-3 text-xs text-ink-soft">
        주행거리는 넣은 양 × 연비({report.kmpl}km/L)로 추정한 값이에요. 기록은 이 브라우저에만 저장해요.
      </p>
    </div>
  );
}
