"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AlertProposal } from "@/lib/chatbot";
import { DEFAULT_PLACE, PLACES } from "@/lib/places";
import { addAlert, alertStore, parseAlerts, removeAlert, type SavedAlert } from "@/lib/savedAlerts";
import {
  AlertCard,
  AlertCheckCard,
  CostCard,
  TaxCard,
  type AlertCheck,
  type AlertStatus,
  type CostResult,
  type CostStation,
  type PriceRow,
  type TaxImpact,
} from "./AnswerCards";
import { basis, koreanTime, monthDay, PUMP_NOTE, won } from "./format";

const FUELS = ["휘발유", "경유"];
const LITER_OPTIONS = [20, 30, 40, 50, 60];
const ERROR_TEXT = "답변을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.";
const ALERT_EXAMPLE = "경유 1,750원 밑으로 내려가면 알려 줘";
// 서버가 받는 대화 한도(20턴, 한 턴 500자)에 맞춘다.
const MAX_HISTORY = 19;
const MAX_TURN_LENGTH = 500;
// 알림 카드 구분용 번호. 화면 상태에 쓰지 않으므로 모듈 변수로 둔다.
let alertSeq = 0;

type Region = { key: string; area: string; name: string };
type Station = { id: string; name: string; brand: string; price: number; address: string };
type StationDetail = {
  name: string;
  brand: string;
  phone: string;
  qualityCertified: boolean;
  prices: { fuel: string; price: number; updatedAt: string | null }[];
};
type NoticeFigures = {
  event: string;
  effectiveDate: string;
  changeWon: number;
  day: number;
  date: string;
  stations: number;
  unchanged: number;
  meanMovedWon: number;
  atOrBeyondNotice: number;
};
type Check = { verified: number; blocked: boolean };
type SkeletonKind = "list" | "detail" | "text";
// 카드 답변에는 summary를 붙인다. 자유 질문을 보낼 때 대화 기록에 이 요약이 들어가, AI가 이미 답한 질문을 다시 답하지 않는다.
type Reply =
  | { from: "bot"; text: string; check?: Check }
  | { from: "bot"; summary: string; notice: { text: string; figures: NoticeFigures } }
  | { from: "bot"; summary: string; title: string; fetchedAt: string; stations: Station[] }
  | { from: "bot"; summary: string; detail: StationDetail }
  | { from: "bot"; summary: string; cost: CostResult }
  | { from: "bot"; summary: string; tax: TaxImpact; taxCost: CostResult | null }
  | { from: "bot"; summary: string; alert: AlertProposal; status: AlertStatus; id: number }
  | { from: "bot"; summary: string; alertCheck: AlertCheck }
  | { from: "bot"; error: string; retry: () => void };
type Message = { from: "user"; text: string } | Reply;
type Turn = { role: "user" | "assistant"; content: string };

async function getJson(url: string, init?: RequestInit) {
  try {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null);
    return { ok: response.ok, body };
  } catch {
    return { ok: false, body: null };
  }
}

const listSummary = (stations: { name: string; price: number }[]) =>
  stations.map((station, rank) => `${rank + 1}. ${station.name} ${won(station.price)}원`).join(", ");

function costSummary(cost: CostResult) {
  const rows = cost.stations
    .map((s, rank) => `${rank + 1}. ${s.name} 리터당 ${won(s.price)}원, 직선 ${s.distanceKm}km, 총 ${won(s.totalWon)}원`)
    .join("; ");
  return `${cost.place} 출발 ${cost.fuel} ${cost.liters}L 실질비용 순(연비 ${cost.kmpl}km/L, 직선 왕복, ${koreanTime(cost.fetchedAt)} 조회): ${rows}`;
}

function taxSummary(tax: TaxImpact, cost: CostResult | null) {
  const best = cost?.stations[0];
  return (
    `유류세 인하는 ${tax.endsOn} 종료 예정(${tax.decidedOn} 연장 결정). 끝나면 ${tax.fuel} ${tax.liters}L에 최대 ${won(tax.maxExtraWon)}원 더 듦(리터당 ${tax.wonPerLiter}원).` +
    (best && cost ? ` ${cost.place} 출발 거리까지 따진 추천: ${best.name} 리터당 ${won(best.price)}원.` : "")
  );
}

const ALERT_STATUS: Record<AlertStatus, string> = {
  proposed: "저장 전",
  saved: "저장함",
  unsaved: "저장 못 함",
  dismissed: "저장 안 함",
};
const alertSummary = (alert: AlertProposal, status: AlertStatus) =>
  `알림 조건: ${alert.areaName} ${alert.fuel} ${won(alert.belowWon)}원 이하(${ALERT_STATUS[status]})`;

// 화면의 대화를 서버로 보낼 대화 기록으로 바꾼다. 실패한 질문은 빼고, 같은 쪽이 이어지면 합쳐서 질문과 답이 번갈아 오게 한다.
function toTurns(messages: Message[]) {
  const turns: Turn[] = [];
  for (const message of messages) {
    if (message.from === "user") {
      const last = turns.at(-1);
      if (last?.role === "user") last.content = message.text;
      else turns.push({ role: "user", content: message.text });
      continue;
    }
    const content = "text" in message ? message.text : "summary" in message ? message.summary : null;
    if (content === null) {
      if (turns.at(-1)?.role === "user") turns.pop();
      continue;
    }
    const last = turns.at(-1);
    if (last?.role === "assistant") last.content = `${last.content}\n${content}`;
    else turns.push({ role: "assistant", content });
  }
  const recent = turns.slice(-MAX_HISTORY);
  return recent
    .slice(Math.max(0, recent.findIndex((turn) => turn.role === "user")))
    .map((turn) => ({ ...turn, content: turn.content.slice(0, MAX_TURN_LENGTH) }));
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute right-2.5 size-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Skeleton({ kind }: { kind: SkeletonKind }) {
  const rows = kind === "list" ? 5 : 3;
  return (
    <div role="status" className="w-full max-w-[34rem] animate-rise rounded-3xl bg-ground p-5 shadow-raised">
      <span className="sr-only">답변을 준비하고 있어요</span>
      <div aria-hidden="true" className="space-y-4">
        {kind !== "text" && <div className="groove h-4 w-40" />}
        {Array.from({ length: rows }, (_, index) =>
          kind === "list" ? (
            <div key={index} className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <div className="groove h-3.5 w-3/5" />
                <div className="groove h-2.5 w-4/5" />
              </div>
              <div className="groove h-5 w-16" />
            </div>
          ) : (
            <div key={index} className="groove h-3.5" style={{ width: `${[92, 78, 54][index]}%` }} />
          ),
        )}
      </div>
    </div>
  );
}

const SELECT =
  "appearance-none rounded-full bg-ground py-1.5 pr-8 pl-3.5 text-sm font-semibold shadow-inset-sm focus-visible:outline-offset-1";

export default function ChatPanel({ fixedQuestion, region }: { fixedQuestion: string; region: Region }) {
  const [fuel, setFuel] = useState(FUELS[0]);
  const [place, setPlace] = useState(DEFAULT_PLACE);
  const [liters, setLiters] = useState(40);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<SkeletonKind | null>(null);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const savedRaw = useSyncExternalStore(alertStore.subscribe, alertStore.getSnapshot, alertStore.getServerSnapshot);
  const saved = useMemo(() => parseAlerts(savedRaw), [savedRaw]);
  const placeName = PLACES[place].name;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  async function run(kind: SkeletonKind, answer: () => Promise<Reply | Reply[] | null>) {
    setPending(kind);
    const reply = await answer();
    const retry = () => {
      setMessages((current) => current.filter((message) => !("retry" in message && message.retry === retry)));
      run(kind, answer);
    };
    const replies = reply === null ? [{ from: "bot" as const, error: ERROR_TEXT, retry }] : [reply].flat();
    setMessages((current) => [...current, ...replies]);
    setPending(null);
  }

  function ask(question: string, kind: SkeletonKind, answer: () => Promise<Reply | Reply[] | null>) {
    setMessages((current) => [...current, { from: "user", text: question }]);
    run(kind, answer);
  }

  const askCheapest = () => {
    const chosen = fuel;
    ask(`${region.name}에서 제일 싼 ${chosen} 어디야?`, "list", async () => {
      const { ok, body } = await getJson(`/api/stations/cheapest?${new URLSearchParams({ fuel: chosen, area: region.area })}`);
      if (!ok || !body) return null;
      if (body.stations.length === 0) return { from: "bot", text: "조회된 주유소가 없어요." };
      const title = `${body.area} ${chosen} 최저가`;
      return {
        from: "bot",
        title,
        fetchedAt: body.fetchedAt,
        stations: body.stations,
        summary: `${title}(${koreanTime(body.fetchedAt)} 조회): ${listSummary(body.stations)}`,
      };
    });
  };

  const askDetail = (station: { id: string; name: string }) =>
    ask(`${station.name} 자세히 알려 줘`, "detail", async () => {
      const { ok, body } = await getJson(`/api/stations/${station.id}`);
      if (!ok || !body) return null;
      const prices = (body as StationDetail).prices
        .map((price) => `${price.fuel} ${won(price.price)}원(${basis(price.updatedAt)})`)
        .join(", ");
      return { from: "bot", detail: body, summary: `${body.name} 상세: ${prices}` };
    });

  const askTotalCost = () => {
    const [chosenFuel, chosenPlace, chosenLiters] = [fuel, place, liters];
    ask(`${PLACES[chosenPlace].name}에서 거리까지 따지면 ${chosenFuel} 어디가 나아?`, "list", async () => {
      const query = new URLSearchParams({ fuel: chosenFuel, place: chosenPlace, liters: String(chosenLiters) });
      const { ok, body } = await getJson(`/api/stations/total-cost?${query}`);
      if (!ok || !body) return null;
      if (body.stations.length === 0) {
        return { from: "bot", text: `${body.place} 반경 ${body.radiusKm}km 안에서 ${chosenFuel} 가격을 알린 주유소가 없어요.` };
      }
      return { from: "bot", cost: body, summary: costSummary(body) };
    });
  };

  const askTax = () => {
    const [chosenFuel, chosenPlace, chosenLiters] = [fuel, place, liters];
    ask(`유류세 인하 끝나면 ${chosenFuel} ${chosenLiters}L에 얼마 더 들어?`, "text", async () => {
      const query = new URLSearchParams({ fuel: chosenFuel, place: chosenPlace, liters: String(chosenLiters) });
      const { ok, body } = await getJson(`/api/alert-preview?${query}`);
      if (!ok || !body?.tax) return null;
      return { from: "bot", tax: body.tax, taxCost: body.cost, summary: taxSummary(body.tax, body.cost) };
    });
  };

  const askFixed = () => {
    const chosen = fuel;
    ask(fixedQuestion, "text", async () => {
      const { ok, body } = await getJson(`/api/fixed-question?${new URLSearchParams({ region: region.key, fuel: chosen })}`);
      return ok && body?.figures
        ? { from: "bot", notice: { text: body.text, figures: body.figures }, summary: body.text }
        : null;
    });
  };

  const checkAlert = (alert: AlertProposal) =>
    ask(`${alert.areaName} ${alert.fuel} ${won(alert.belowWon)}원 이하 알림, 지금 확인해 줘`, "list", async () => {
      const { ok, body } = await getJson(`/api/stations/cheapest?${new URLSearchParams({ fuel: alert.fuel, area: alert.area })}`);
      if (!ok || !body) return null;
      const stations: PriceRow[] = body.stations;
      const matches = stations.filter((station) => station.price <= alert.belowWon);
      const lowest = stations[0] ?? null;
      return {
        from: "bot",
        alertCheck: { ...alert, fetchedAt: body.fetchedAt, matches, lowest },
        summary:
          `${alert.areaName} ${alert.fuel} ${won(alert.belowWon)}원 이하 알림 확인(${koreanTime(body.fetchedAt)} 조회): ` +
          (matches.length > 0 ? `조건에 맞는 곳 ${listSummary(matches)}` : `아직 없음. 최저가 ${lowest ? `${lowest.name} ${won(lowest.price)}원` : "없음"}`),
      };
    });

  function setAlertStatus(id: number, status: AlertStatus) {
    setMessages((current) =>
      current.map((message) =>
        "alert" in message && message.id === id ? { ...message, status, summary: alertSummary(message.alert, status) } : message,
      ),
    );
  }

  function saveAlert(id: number, alert: AlertProposal) {
    const stored = addAlert(alert);
    setAlertStatus(id, stored ? "saved" : "unsaved");
    checkAlert(alert);
  }

  function askFree(question: string) {
    const history = toTurns([...messages, { from: "user", text: question }]);
    ask(question, "text", async () => {
      const { ok, body } = await getJson("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!ok || !body?.text) return body?.error ? { from: "bot", text: body.error } : null;
      const replies: Reply[] = [{ from: "bot", text: body.text, check: body.check ?? undefined }];
      if (body.alert) {
        replies.push({
          from: "bot",
          alert: body.alert,
          status: "proposed",
          id: alertSeq++,
          summary: alertSummary(body.alert, "proposed"),
        });
      }
      return replies;
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending) return;
    setDraft("");
    askFree(question);
  }

  const busy = pending !== null;
  const suggestions = [
    { label: `${region.name}에서 제일 싼 ${fuel} 어디야?`, onClick: askCheapest },
    { label: `${placeName}에서 거리까지 따지면 어디가 나아?`, onClick: askTotalCost },
    { label: `유류세 인하 끝나면 ${liters}L에 얼마 더 들어?`, onClick: askTax },
    { label: fixedQuestion, onClick: askFixed },
    { label: ALERT_EXAMPLE, onClick: () => askFree(ALERT_EXAMPLE) },
  ];

  return (
    <section
      aria-label="주유 챗봇"
      className="flex h-[calc(100dvh-8.5rem)] min-h-[32rem] flex-col rounded-[2rem] bg-ground shadow-raised"
    >
      <div aria-live="polite" className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pt-6 pb-4 sm:px-7">
        {messages.length === 0 && !busy && (
          <div className="m-auto w-full max-w-lg py-4">
            <h1 className="text-center text-2xl font-bold tracking-tight text-balance sm:text-3xl">
              {region.name} 주유소, 말로 물어보세요
            </h1>
            <p className="mt-3 text-center leading-relaxed text-ink-soft text-balance">
              한국석유공사 오피넷에 보고된 가격으로 답하고, 거리와 내 주유량, 제도 변경까지 따져 드려요.
            </p>
            <ul className="mt-7 space-y-3.5">
              {suggestions.map((suggestion) => (
                <li key={suggestion.label}>
                  <button
                    type="button"
                    onClick={suggestion.onClick}
                    className="w-full rounded-2xl px-5 py-3.5 text-left font-medium shadow-raised transition-shadow hover:shadow-raised-sm active:shadow-inset"
                  >
                    {suggestion.label}
                  </button>
                </li>
              ))}
            </ul>
            {saved.length > 0 && <SavedAlerts saved={saved} onCheck={checkAlert} />}
          </div>
        )}

        {messages.map((message, index) => {
          if (message.from === "user") {
            return (
              <p
                key={index}
                className="ml-auto w-fit max-w-[85%] animate-press rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] shadow-inset"
              >
                {message.text}
              </p>
            );
          }
          if ("tax" in message) {
            return <TaxCard key={index} tax={message.tax} cost={message.taxCost} />;
          }
          if ("cost" in message) {
            return <CostCard key={index} cost={message.cost} busy={busy} onDetail={(station: CostStation) => askDetail(station)} />;
          }
          if ("alertCheck" in message) {
            return <AlertCheckCard key={index} check={message.alertCheck} />;
          }
          if ("alert" in message) {
            return (
              <AlertCard
                key={index}
                alert={message.alert}
                status={message.status}
                busy={busy}
                onSave={() => saveAlert(message.id, message.alert)}
                onDismiss={() => setAlertStatus(message.id, "dismissed")}
              />
            );
          }
          if ("stations" in message) {
            return (
              <div key={index} className="max-w-[34rem] animate-rise rounded-3xl bg-ground p-5 shadow-raised">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink-soft">{message.title}</h2>
                  <span className="rounded-full px-2.5 py-1 text-xs font-medium text-ink-soft tabular-nums shadow-inset-sm">
                    {koreanTime(message.fetchedAt)} 조회
                  </span>
                </div>
                <ol className="mt-2 divide-y divide-hairline">
                  {message.stations.map((station, rank) => (
                    <li key={station.id}>
                      <button
                        type="button"
                        onClick={() => askDetail(station)}
                        disabled={busy}
                        aria-label={`${station.name} ${won(station.price)}원, 자세히 보기`}
                        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-3 text-left transition-shadow hover:shadow-inset-sm active:shadow-inset disabled:cursor-default disabled:hover:shadow-none"
                      >
                        <span className="w-4 shrink-0 text-sm text-ink-soft tabular-nums">{rank + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">
                            {station.name} <span className="text-sm font-normal text-ink-soft">{station.brand}</span>
                          </span>
                          <span className="block truncate text-xs text-ink-soft">{station.address}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-xl font-bold tabular-nums">
                            {won(station.price)}
                            <span className="ml-0.5 text-sm font-medium">원</span>
                          </span>
                          <span className="block text-xs font-medium text-ink-soft">자세히</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-ink-soft">
                  {PUMP_NOTE} 가격별 기준 시각은 자세히에서 볼 수 있어요.
                </p>
              </div>
            );
          }
          if ("notice" in message) {
            const { figures, text } = message.notice;
            const cut = figures.changeWon < 0;
            return (
              <div key={index} className="max-w-[34rem] animate-rise rounded-3xl bg-ground p-5 shadow-raised">
                <h2 className="text-sm font-semibold text-ink-soft">
                  {figures.event} 고시({monthDay(figures.effectiveDate)}, 리터당 {Math.abs(figures.changeWon)}원{" "}
                  {cut ? "인하" : "인상"}) 뒤 {figures.day}일째 · {monthDay(figures.date)}
                </h2>
                <dl className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: "아직 그대로", value: figures.unchanged, unit: "곳", note: `${figures.stations}곳 중` },
                    { label: `평균 ${cut ? "인하" : "인상"}`, value: figures.meanMovedWon, unit: "원", note: "고시 전날 대비" },
                    {
                      label: `${Math.abs(figures.changeWon)}원 이상 ${cut ? "인하" : "인상"}`,
                      value: figures.atOrBeyondNotice,
                      unit: "곳",
                      note: `${figures.stations}곳 중`,
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl px-3 py-3 shadow-inset-sm">
                      <dt className="text-xs text-ink-soft">{item.label}</dt>
                      <dd className="mt-1 text-2xl font-bold tabular-nums">
                        {item.value}
                        <span className="ml-0.5 text-sm font-medium">{item.unit}</span>
                      </dd>
                      <dd className="text-xs text-ink-soft">{item.note}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-[15px] leading-relaxed">{text}</p>
              </div>
            );
          }
          if ("detail" in message) {
            const { detail } = message;
            return (
              <div key={index} className="max-w-[34rem] animate-rise rounded-3xl bg-ground p-5 shadow-raised">
                <h2 className="font-semibold">
                  {detail.name} <span className="text-sm font-normal text-ink-soft">{detail.brand}</span>
                </h2>
                <ul className="mt-3 space-y-3">
                  {detail.prices.map((price) => (
                    <li key={price.fuel} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="w-16 text-sm text-ink-soft">{price.fuel}</span>
                      <span className="text-2xl font-bold tabular-nums">
                        {won(price.price)}
                        <span className="ml-0.5 text-sm font-medium">원</span>
                      </span>
                      <span className="rounded-full px-2.5 py-1 text-xs font-medium text-ink-soft tabular-nums shadow-inset-sm">
                        {basis(price.updatedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-ink-soft">
                  {detail.phone && `전화 ${detail.phone} · `}품질인증 {detail.qualityCertified ? "있음" : "없음"}
                </p>
                <p className="mt-1 text-xs text-ink-soft">{PUMP_NOTE}</p>
              </div>
            );
          }
          if ("error" in message) {
            return (
              <div key={index} className="flex max-w-[34rem] animate-rise flex-wrap items-center gap-3 rounded-3xl p-4 shadow-raised">
                <p className="flex-1 text-[15px]">{message.error}</p>
                <button
                  type="button"
                  onClick={message.retry}
                  disabled={busy}
                  className="rounded-full px-4 py-2 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm disabled:opacity-50"
                >
                  다시 시도
                </button>
              </div>
            );
          }
          return (
            <div key={index} className="w-fit max-w-[34rem] animate-rise">
              <p className="whitespace-pre-line rounded-3xl rounded-bl-md p-4 text-[15px] leading-relaxed shadow-raised">
                {message.text}
              </p>
              {message.check && message.check.verified > 0 && (
                <p className="mt-2.5 w-fit rounded-full px-2.5 py-1 text-xs font-medium text-ink-soft tabular-nums shadow-inset-sm">
                  숫자 {message.check.verified}개 · 조회 결과와 대조해 일치
                </p>
              )}
            </div>
          );
        })}

        {pending && <Skeleton kind={pending} />}
        <div ref={endRef} />
      </div>

      <div className="space-y-3 border-t border-hairline/70 px-4 pt-4 pb-4 sm:px-7 sm:pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="유종" className="flex shrink-0 rounded-full p-1 shadow-inset-sm">
            {FUELS.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={fuel === item}
                onClick={() => setFuel(item)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-shadow ${
                  fuel === item ? "bg-accent shadow-raised-sm" : "text-ink-soft"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <span className="relative flex items-center">
            <select aria-label="출발 위치" title="출발 위치(읍면 행정복지센터)" value={place} onChange={(event) => setPlace(event.target.value)} className={SELECT}>
              {Object.entries(PLACES).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.name}
                </option>
              ))}
            </select>
            <Chevron />
          </span>
          <span className="relative flex items-center">
            <select
              aria-label="주유량"
              title="한 번에 넣는 주유량"
              value={liters}
              onChange={(event) => setLiters(Number(event.target.value))}
              className={SELECT}
            >
              {LITER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}L
                </option>
              ))}
            </select>
            <Chevron />
          </span>
        </div>

        {(messages.length > 0 || busy) && (
          <div className="no-scrollbar -my-2 flex gap-2.5 overflow-x-auto py-2 pr-1 pl-1 sm:flex-wrap sm:overflow-visible">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                onClick={suggestion.onClick}
                disabled={busy}
                className="shrink-0 rounded-full px-3.5 py-2 text-sm whitespace-nowrap shadow-raised-sm transition-shadow hover:shadow-raised active:shadow-inset-sm disabled:opacity-50"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="flex items-center gap-3">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            placeholder="예: 언양 쪽 경유, 거리까지 따지면 어디가 나아?"
            aria-label="질문 입력"
            className="min-w-0 flex-1 rounded-full bg-transparent px-5 py-3.5 text-[15px] shadow-inset placeholder:text-ink-soft focus-visible:outline-offset-1"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label={busy ? "답변을 준비하고 있어요" : "질문 보내기"}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-ink shadow-raised-sm transition-shadow hover:shadow-raised active:shadow-inset-sm disabled:cursor-default disabled:shadow-inset-sm"
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </section>
  );
}

function SavedAlerts({ saved, onCheck }: { saved: SavedAlert[]; onCheck: (alert: SavedAlert) => void }) {
  return (
    <section aria-label="저장한 가격 알림" className="mt-7">
      <h2 className="text-sm font-semibold text-ink-soft">내 가격 알림</h2>
      <ul className="mt-2 space-y-2.5">
        {saved.map((alert) => (
          <li key={alert.id} className="flex flex-wrap items-center gap-2.5 rounded-2xl px-4 py-3 shadow-inset-sm">
            <span className="flex-1 font-semibold">
              {alert.areaName} {alert.fuel} <span className="tabular-nums">{won(alert.belowWon)}</span>원 이하
            </span>
            <button
              type="button"
              onClick={() => onCheck(alert)}
              className="rounded-full px-3.5 py-1.5 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm"
            >
              지금 확인
            </button>
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
    </section>
  );
}
