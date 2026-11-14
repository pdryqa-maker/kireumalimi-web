"use client";

// 내 기록 대시보드: 고른 달의 숫자 카드, 월별 쓴 돈 그래프, 다음 주유일, 주유 기록 표. 결과와 사진 읽기는 대시보드 안 패널에서 한다.
// 숫자는 이 브라우저의 장부로 셈한다. 오피넷은 "시도 평균보다" 한 줄만 그 달을 처음 볼 때 한 번 부르고 결과를 브라우저에 남긴다.
import { useEffect, useRef, useState } from "react";
import { browserStore } from "@/lib/browserStore";
import { forecastNextFill, todayKst, type FillForecast } from "@/lib/fillForecast";
import {
  dotUnit,
  forecastRecords,
  monthFingerprint,
  monthlySpend,
  paidWon,
  totals,
  vsAreaFinal,
  type MonthSpend,
} from "@/lib/fillTotals";
import { fuelEconomy, type KmplSource } from "@/lib/fuelEconomy";
import { MAX_SAVED_LEDGER, type LedgerEntry } from "@/lib/ledger";
import { fillStore, parseFills } from "@/lib/savedFills";
import { ledgerForMonth, ledgerStore, mergeLedger, parseLedger } from "@/lib/savedLedger";
import ChatPanel, { type PanelCommand, type PanelHandle } from "./ChatPanel";
import { DashboardPanel, usePanelState } from "./DashboardPanel";
import { dayWithWeekday, won } from "./format";
import { CameraIcon } from "./icons";
import { monthName, MonthlyChart, PHONE_MONTHS, spendText } from "./MonthlyChart";
import { useMounted, useProfile, useStored } from "./useStored";

type Region = { key: string; area: string; name: string };
type VsArea = { fingerprint: string; area: string; savedWon: number; comparedFills: number };

const RECEIPT_QUESTION = "영수증 사진으로 주유 기록 남겨 줘";
const CHART_MONTHS = 12;

// 그 달 시도 평균 비교 결과. 다 견준 지난 달만 기록 지문과 함께 남겨, 지문이 같으면 다시 부르지 않는다(vsAreaFinal).
const vsAreaStore = browserStore("kireumalimi.vsArea", "{}");
const parseVsArea = (raw: string): Record<string, VsArea> => {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

const SOURCE: Record<KmplSource, string> = {
  measured: "가득→가득 실측",
  dashboard: "계기판 평균",
  car: "차종 공인 연비",
  size: "차 크기 평균",
  manual: "직접 넣은 연비",
  default: "기본값(차종을 모름)",
};

const CARD = "rounded-3xl bg-ground p-5 shadow-raised";
const BUTTON = "rounded-full px-4 py-2 text-sm font-semibold shadow-raised-sm hover:bg-canvas disabled:opacity-50";

function Stat({ label, value, lines }: { label: string; value: string; lines: string[] }) {
  return (
    <div className={`${CARD} min-w-0`}>
      <h2 className="text-xs font-medium text-ink-soft">{label}</h2>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {lines.map((line) => (
        <p key={line} className="mt-1 text-xs leading-relaxed text-ink-soft">
          {line}
        </p>
      ))}
    </div>
  );
}

const fillMark = (entry: LedgerEntry) =>
  [entry.full ? "가득" : "", entry.odometerKm ? `${won(entry.odometerKm)}km` : ""].filter(Boolean).join(" · ") || "—";
const litersText = (entry: LedgerEntry) => (entry.liters !== null ? `${entry.liters}L` : "—");
const priceText = (entry: LedgerEntry) => (entry.pricePerLiter !== null ? `${won(entry.pricePerLiter)}원` : "—");
const paidText = (entry: LedgerEntry) => {
  const paid = paidWon(entry);
  return paid !== null ? `${won(paid)}원` : "—";
};

// 다음 주유일. 기록이 2번 안 되면 비우고, 예보가 받지 않는 기록(같은 날 두 번 등)이면 그 까닭을 돌려준다.
function nextFill(entries: LedgerEntry[], today: string | null): { forecast: FillForecast | null; problem: string } {
  const records = forecastRecords(entries);
  if (!today || records.length < 2) return { forecast: null, problem: "" };
  try {
    return { forecast: forecastNextFill(records, today), problem: "" };
  } catch (problem) {
    return { forecast: null, problem: problem instanceof Error ? problem.message : "" };
  }
}

// 지난달 대비: 두 달 모두 온전히 남은 달일 때만
function compareText(current: MonthSpend, previous: MonthSpend | undefined) {
  if (!previous || current.state !== "full" || previous.state !== "full") return null;
  const diff = current.won - previous.won;
  if (diff === 0) return "지난달과 같아요";
  return `지난달보다 ${won(Math.abs(diff))}원 ${diff > 0 ? "더" : "덜"}`;
}

export default function RecordsDashboard({ fixedQuestion, region }: { fixedQuestion: string; region: Region }) {
  const profile = useProfile();
  const mounted = useMounted();
  const ledger = useStored(ledgerStore, parseLedger);
  const fills = useStored(fillStore, parseFills);
  const vsArea = useStored(vsAreaStore, parseVsArea);
  const entries = mergeLedger(ledger, fills);
  const economy = fuelEconomy(profile);
  // 오늘 날짜는 서버와 다를 수 있어 브라우저에서 그릴 때만 쓴다.
  const today = mounted ? todayKst() : null;
  const thisMonth = today?.slice(0, 7) ?? "";
  const [selectedChoice, setSelected] = useState<string | null>(null);
  const month = selectedChoice ?? thisMonth;

  // 13달을 셈해 맨 앞 달의 지난달 대비도 낼 수 있게 하고, 그래프는 최근 12달만 그린다.
  const capped = entries.length >= MAX_SAVED_LEDGER;
  const spend = today ? monthlySpend(entries, today, CHART_MONTHS + 1, capped) : [];
  const months = spend.slice(1);
  const unit = dotUnit(Math.max(0, ...months.map((item) => item.won)));
  const at = spend.findIndex((item) => item.month === month);
  const current = spend[at];
  const previous = at > 0 ? spend[at - 1] : undefined;
  const monthEntries = entries.filter((entry) => entry.date.startsWith(month));
  const sum = totals(monthEntries, economy.kmpl);
  const hasRecords = entries.length > 0;

  // "시도 평균보다" 한 줄: 그 달 단가 있는 기록이 있을 때만, 처음 볼 때 한 번 받는다.
  const priced = month ? monthFingerprint(entries, month) : "";
  const fingerprint = priced ? `${profile.fuel}|${profile.area?.code ?? ""}|${priced}` : "";
  // 오래 남기지 않는 결과(이번 달, 일부만 견줌, 오피넷 장애)는 이 화면에서만 들고 있어 다시 그릴 때 또 부르지 않는다.
  const [shown, setShown] = useState<Record<string, VsArea>>({});
  const cached = !fingerprint ? null : vsArea[month]?.fingerprint === fingerprint ? vsArea[month] : (shown[fingerprint] ?? null);
  const pricedFills = priced ? priced.split(",").length : 0;
  const [failed, setFailed] = useState<string | null>(null);
  const inflight = useRef(new Set<string>());
  useEffect(() => {
    if (!fingerprint || cached || failed === fingerprint || inflight.current.has(fingerprint)) return;
    inflight.current.add(fingerprint);
    fetch("/api/fuel-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ledger: ledgerForMonth(month), profile, month }),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body) => {
        // vsArea가 null이면 이번에는 하나도 견주지 못한 것이다(평균이 없거나 오피넷을 못 불렀다).
        const result = body?.vsArea;
        if (result !== null && typeof result?.savedWon !== "number") throw new Error("vsArea 없음");
        const entry: VsArea = result
          ? { fingerprint, area: String(result.area ?? ""), savedWon: result.savedWon, comparedFills: Number(result.comparedFills) || 0 }
          : { fingerprint, area: "", savedWon: 0, comparedFills: 0 };
        setShown((current) => ({ ...current, [fingerprint]: entry }));
        if (vsAreaFinal(entry.comparedFills, pricedFills, month, today ?? "")) {
          vsAreaStore.write({ ...parseVsArea(vsAreaStore.read()), [month]: entry });
        }
      })
      .catch(() => setFailed(fingerprint))
      .finally(() => inflight.current.delete(fingerprint));
  }, [fingerprint, cached, failed, month, profile, pricedFills, today]);
  const savedLine = !priced
    ? null
    : cached
      ? cached.comparedFills === 0
        ? null
        : `${cached.area} 평균보다 ${won(Math.abs(cached.savedWon))}원 ${cached.savedWon >= 0 ? "아낌" : "더 씀"}(${cached.comparedFills}번 비교)`
      : failed === fingerprint
        ? null
        : "시도 평균과 견주는 중…";

  // 다음 주유일(AI·오피넷 없이 최근 5번으로 셈)
  const { forecast, problem: forecastProblem } = nextFill(entries, today);

  // 결과 패널
  const panelRef = useRef<PanelHandle>(null);
  const { open, busy, hasResult, onActivity, openPanel, closePanel } = usePanelState();
  const run = (command: PanelCommand) => {
    // 사진 고르기는 사진을 고른 뒤 답을 준비할 때 패널이 열린다(고르기를 취소하면 그대로).
    if (command.kind !== "photo") openPanel();
    panelRef.current?.run(command);
  };
  // 계기판 찍기는 내 정보(연비)에 있다. 채팅 입력창의 사진 버튼으로도 계기판을 읽을 수 있다.
  const photoButtons = (
    <button type="button" disabled={busy} onClick={() => run({ kind: "photo", question: RECEIPT_QUESTION })} className={`${BUTTON} flex items-center gap-1.5 self-start sm:self-auto`}>
      <CameraIcon className="size-4" />
      영수증 찍기
    </button>
  );

  const label = month ? monthName(month) : "";
  // 그래프 아래 설명: 흐린 달(첫 기록 전), '일부'·'모름' 표시가 무엇인지, 고른 달에서 빠진 주유
  // 휴대폰은 최근 6달만 그리므로, 흐린 달이 그 앞에만 있으면 휴대폰에서는 그 설명을 숨긴다.
  const notePhone = (shown: (item: MonthSpend) => boolean) =>
    months.slice(-PHONE_MONTHS).some(shown) ? "" : "hidden md:inline";
  const chartNotes = (
    hasRecords
      ? [
          months.some((item) => item.state === "before") && {
            text: "흐린 달은 첫 기록 전이에요.",
            className: notePhone((item) => item.state === "before"),
          },
          months.some((item) => item.state === "partial") && {
            text: "'일부'는 오래된 기록이 100번 한도로 지워져 일부만 남은 달이에요.",
            className: notePhone((item) => item.state === "partial"),
          },
          current &&
            current.wonUnknownFills > 0 && {
              text: `${label}: 금액 모르는 주유 ${current.wonUnknownFills}번은 그래프에서 빠졌어요('모름').`,
              className: "",
            },
        ]
      : []
  ).filter((note) => note !== false && note !== undefined && note !== null);
  const dash = !hasRecords || !current || current.state === "before";
  const spentLines = dash
    ? []
    : [
        compareText(current, previous) ?? "",
        current.state === "partial" ? "앞쪽 기록이 일부만 남은 달이에요" : "",
        sum.wonUnknownFills > 0 ? `금액 모르는 주유 ${sum.wonUnknownFills}번 빼고` : "",
      ].filter(Boolean);

  return (
    <div data-wide="" className="grid gap-x-6 pb-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="min-w-0 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">내 기록</h1>
            <p className="mt-1 text-ink-soft">
              {hasRecords
                ? `주유 기록 ${entries.length}번 · 가장 최근 ${dayWithWeekday(entries.at(-1)!.date)}`
                : "영수증을 찍으면 주유 기록이 쌓이고, 달마다 모아 보여 드려요."}
            </p>
          </div>
          {photoButtons}
        </div>

        <section aria-label={`${label} 숫자`} className="mt-5">
          <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
            <Stat label={`${label} 쓴 돈`} value={dash ? "—" : `${won(current.won)}원`} lines={spentLines} />
            <Stat
              label="넣은 양"
              value={dash ? "—" : `${sum.liters}L`}
              lines={dash ? [] : [`${sum.fills}번 주유`, sum.litersUnknownFills > 0 ? `양 모르는 주유 ${sum.litersUnknownFills}번 빼고` : ""].filter(Boolean)}
            />
            <Stat
              label="평균 단가"
              value={dash || sum.avgPricePerLiter === null ? "—" : `${won(Math.round(sum.avgPricePerLiter))}원/L`}
              lines={dash || !savedLine ? [] : [savedLine]}
            />
            <Stat label="내 연비" value={`${economy.kmpl}km/L`} lines={[SOURCE[economy.source]]} />
          </div>
          {hasRecords && current && current.state !== "before" && (
            <button type="button" disabled={busy} onClick={() => run({ kind: "report", month })} className={`${BUTTON} mt-3`}>
              {label} 리포트 자세히
            </button>
          )}
        </section>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
          <section aria-labelledby="monthly-title" className={CARD}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="monthly-title" className="font-semibold">
                월별 쓴 돈
              </h2>
              <p className="text-xs text-ink-soft">점 하나 = {spendText(unit)} · 달을 누르면 그 달로 바뀌어요</p>
            </div>
            <div className="relative mt-3">
              {months.length > 0 && <MonthlyChart months={months} unit={unit} selected={month} onSelect={setSelected} />}
              {mounted && !hasRecords && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                  <p className="rounded-full bg-ground px-3 py-1 text-sm text-ink-soft">영수증을 찍으면 여기에 쌓여요</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run({ kind: "photo", question: RECEIPT_QUESTION })}
                    className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
                  >
                    영수증 찍기
                  </button>
                </div>
              )}
            </div>
            {chartNotes.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                {chartNotes.map((note) => (
                  <span key={note.text} className={note.className}>
                    {note.text}{" "}
                  </span>
                ))}
              </p>
            )}
          </section>

          <section aria-labelledby="next-fill-title" className={`${CARD} flex flex-col`}>
            <h2 id="next-fill-title" className="text-xs font-medium text-ink-soft">
              다음 주유일
            </h2>
            {forecast ? (
              <>
                <p className="mt-2 text-2xl font-bold tracking-tight">{dayWithWeekday(forecast.nextDate)}</p>
                <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-soft">
                  {forecast.due ? "지금 넣을 때예요. " : ""}평균 {forecast.avgGapDays}일 간격 · 최근 {forecast.records.length}번 기준
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => forecast && run({ kind: "forecast", forecast })}
                  className={`${BUTTON} mt-auto self-start`}
                >
                  다음 주유일에 넣을 주유소 찾기
                </button>
              </>
            ) : (
              <>
                <p className="mt-2 text-[15px] leading-relaxed">
                  {forecastProblem || "기록이 2번 이상 있어야 계산할 수 있어요."}
                </p>
                <button type="button" disabled={busy} onClick={() => run({ kind: "fillForm" })} className={`${BUTTON} mt-4 self-start`}>
                  기록 넣기
                </button>
              </>
            )}
          </section>
        </div>

        <section aria-labelledby="ledger-title" className={`${CARD} mt-6`}>
          <h2 id="ledger-title" className="font-semibold">
            {label} 주유 기록
          </h2>
          {monthEntries.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              {hasRecords ? "이 달에는 주유 기록이 없어요." : "아직 주유 기록이 없어요. 영수증을 찍거나 기록을 넣어 주세요."}
            </p>
          ) : (
            <>
              <table className="mt-3 hidden w-full text-left text-sm md:table">
                <thead className="text-xs text-ink-soft">
                  <tr className="border-b border-hairline">
                    <th className="py-2 font-medium">날짜</th>
                    <th className="py-2 font-medium">주유소</th>
                    <th className="py-2 text-right font-medium">넣은 양</th>
                    <th className="py-2 text-right font-medium">단가</th>
                    <th className="py-2 text-right font-medium">금액</th>
                    <th className="py-2 pl-4 font-medium">가득·주행거리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline tabular-nums">
                  {[...monthEntries].reverse().map((entry) => (
                    <tr key={entry.date}>
                      <td className="py-2.5 whitespace-nowrap">{dayWithWeekday(entry.date)}</td>
                      <td className="py-2.5">{entry.stationName ?? "—"}</td>
                      <td className="py-2.5 text-right">{litersText(entry)}</td>
                      <td className="py-2.5 text-right">{priceText(entry)}</td>
                      <td className="py-2.5 text-right font-semibold">{paidText(entry)}</td>
                      <td className="py-2.5 pl-4 text-ink-soft">{fillMark(entry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-2 divide-y divide-hairline md:hidden">
                {[...monthEntries].reverse().map((entry) => (
                  <li key={entry.date} className="py-2.5">
                    <p className="flex justify-between gap-3 text-sm">
                      <span className="font-medium">{dayWithWeekday(entry.date)}</span>
                      <span className="truncate text-ink-soft">{entry.stationName ?? "—"}</span>
                    </p>
                    <p className="mt-0.5 flex justify-between gap-3 text-sm tabular-nums">
                      <span className="text-ink-soft">
                        {litersText(entry)} · {priceText(entry)}/L{entry.full ? " · 가득" : ""}
                      </span>
                      <span className="font-semibold">{paidText(entry)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <DashboardPanel open={open} onOpen={openPanel} onClose={closePanel} label="내 기록 결과" hasResult={hasResult}>
        <ChatPanel
          ref={panelRef}
          variant="panel"
          fixedQuestion={fixedQuestion}
          region={region}
          onActivity={onActivity}
          examples={["이번 달 주유, 평균보다 싸게 넣었어?", "다음 주유는 언제쯤 하면 돼?"]}
        />
      </DashboardPanel>
    </div>
  );
}
