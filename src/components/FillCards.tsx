"use client";

// 내 차 주유 예보: 주유 기록을 받는 카드와, 다음 주유 예상일·알림 미리보기 카드.
import { useState } from "react";
import {
  addDays,
  forecastNextFill,
  MAX_RECORDS,
  MIN_RECORDS,
  todayKst,
  type FillForecast,
  type FillRecord,
} from "@/lib/fillForecast";
import { loadFills } from "@/lib/savedFills";
import type { CostResult } from "./AnswerCards";
import { dayWithWeekday, koreanTime, won } from "./format";

const CARD = "max-w-[34rem] animate-rise rounded-3xl bg-ground p-5 shadow-raised";
const FIELD =
  "min-w-0 rounded-full bg-transparent px-3.5 py-2 text-[15px] tabular-nums shadow-inset-sm focus-visible:outline-offset-1";
const BUTTON = "rounded-full px-4 py-2 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm disabled:opacity-50";

type Row = { date: string; liters: string };

// 저장한 기록이 없으면 예시 기록을 채워 둔다. 이용자가 바꿔 쓰면 된다.
function initialRows(): { rows: Row[]; example: boolean } {
  const saved = loadFills();
  if (saved.length >= MIN_RECORDS) {
    return { rows: saved.map((record) => ({ date: record.date, liters: String(record.liters) })), example: false };
  }
  const today = todayKst();
  return {
    rows: [
      { date: addDays(today, -15), liters: "40" },
      { date: addDays(today, -8), liters: "38" },
      { date: addDays(today, -1), liters: "40" },
    ],
    example: true,
  };
}

export function FillLogCard({ onSubmit, busy }: { onSubmit: (forecast: FillForecast) => void; busy: boolean }) {
  const [{ rows, example }, setState] = useState(initialRows);
  const [error, setError] = useState("");
  const today = todayKst();

  const update = (next: Row[]) => {
    setState({ rows: next, example: false });
    setError("");
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const records: FillRecord[] = rows.map((row) => ({ date: row.date, liters: Number(row.liters) }));
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
        최근에 주유한 날짜와 양을 {MIN_RECORDS}~{MAX_RECORDS}번 넣어 주세요. 기록 사이 간격으로 다음 주유일을 셈해요.
      </p>
      {example && <p className="mt-1 text-xs text-ink-soft">예시 기록이에요. 내 기록으로 바꿔 주세요.</p>}
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
                required
                inputMode="numeric"
                min={1}
                max={300}
                value={row.liters}
                aria-label={`${index + 1}번째 주유량(리터)`}
                onChange={(event) => update(rows.map((item, at) => (at === index ? { ...item, liters: event.target.value } : item)))}
                className={`${FIELD} w-[4.5rem] pr-7 text-right`}
              />
              <span aria-hidden="true" className="pointer-events-none absolute right-3 text-sm text-ink-soft">
                L
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
          <button type="button" onClick={() => update([...rows, { date: today, liters: "40" }])} disabled={busy} className={BUTTON}>
            기록 추가
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-soft">기록은 이 브라우저에만 저장해요.</p>
    </form>
  );
}

export function forecastMessage(forecast: FillForecast, cost: CostResult | null) {
  const best = cost?.stations[0];
  return (
    `${dayWithWeekday(forecast.nextDate)}쯤 주유할 때예요.` +
    (best && cost
      ? ` ${cost.place} 근처 추천: ${best.name}, 리터당 ${won(best.price)}원(거리까지 따져 가장 덜 들어요).`
      : "") +
    " 알림 받는 날 가격으로 다시 골라 드려요."
  );
}

export function ForecastCard({ forecast, cost }: { forecast: FillForecast; cost: CostResult | null }) {
  const best = cost?.stations[0];
  return (
    <div className={CARD}>
      <h2 className="text-sm font-semibold text-ink-soft">내 차 주유 예보</h2>
      <p className="mt-4 text-sm text-ink-soft tabular-nums">
        기록 {forecast.records.length}번 · 평균 {forecast.avgGapDays}일마다 · 보통 {forecast.typicalLiters}L
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
            {cost.place} 출발 {cost.fuel} {cost.liters}L, 거리까지 따져 가장 덜 드는 곳(지금 가격)
          </dt>
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
          {forecast.due
            ? "카카오톡 채널이 열리면 오늘 한 번 이렇게 보내요. 지금은 미리보기예요."
            : `카카오톡 채널이 열리면 ${dayWithWeekday(forecast.notifyOn)} 아침에 한 번 이렇게 보내요. 지금은 미리보기예요.`}
        </figcaption>
        <blockquote className="mt-2 rounded-2xl rounded-tl-md p-4 text-[15px] leading-relaxed shadow-raised-sm">
          {forecastMessage(forecast, cost)}
        </blockquote>
      </figure>
      <p className="mt-3 text-xs text-ink-soft">
        가격이 아니라 내 주유 간격만 기록으로 셈해요. 기록이 쌓일수록 정확해져요.
      </p>
    </div>
  );
}
