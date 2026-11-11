"use client";

import { useEffect, useRef, useState } from "react";

const FUELS = ["휘발유", "경유"];
const ERROR_TEXT = "답변을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.";
const FREE_EXAMPLE = "울주군 경유 제일 싼 곳이랑 기준 시각 알려 줘";
const PUMP_NOTE = "오피넷에 보고된 가격이라 주유소 현장 가격과 다를 수 있어요.";

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
type SkeletonKind = "list" | "detail" | "text";
type Reply =
  | { from: "bot"; text: string }
  | { from: "bot"; notice: { text: string; figures: NoticeFigures } }
  | { from: "bot"; title: string; fetchedAt: string; stations: Station[] }
  | { from: "bot"; detail: StationDetail }
  | { from: "bot"; error: string; retry: () => void };
type Message = { from: "user"; text: string } | Reply;

async function getJson(url: string, init?: RequestInit) {
  try {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null);
    return { ok: response.ok, body };
  } catch {
    return { ok: false, body: null };
  }
}

const won = (price: number) => price.toLocaleString("ko-KR");

// "2026-11-11 07:10" → "11월 11일 07:10 기준"
function basis(updatedAt: string | null) {
  if (!updatedAt) return "기준 시각 없음";
  const [date, time] = updatedAt.split(" ");
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일 ${time} 기준`;
}

// ISO 시각 → "11월 11일 20:31" (한국 시간)
function koreanTime(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}월 ${parts.day}일 ${parts.hour}:${parts.minute}`;
}

// "2026-07-01" → "7월 1일"
function monthDay(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일`;
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
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

export default function ChatPanel({ fixedQuestion, region }: { fixedQuestion: string; region: Region }) {
  const [fuel, setFuel] = useState(FUELS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<SkeletonKind | null>(null);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  async function run(kind: SkeletonKind, answer: () => Promise<Reply | null>) {
    setPending(kind);
    const reply = await answer();
    const retry = () => {
      setMessages((current) => current.filter((message) => !("retry" in message && message.retry === retry)));
      run(kind, answer);
    };
    setMessages((current) => [...current, reply ?? { from: "bot", error: ERROR_TEXT, retry }]);
    setPending(null);
  }

  function ask(question: string, kind: SkeletonKind, answer: () => Promise<Reply | null>) {
    setMessages((current) => [...current, { from: "user", text: question }]);
    run(kind, answer);
  }

  const askCheapest = () => {
    const chosen = fuel;
    ask(`${region.name}에서 제일 싼 ${chosen} 어디야?`, "list", async () => {
      const { ok, body } = await getJson(`/api/stations/cheapest?${new URLSearchParams({ fuel: chosen, area: region.area })}`);
      if (!ok || !body) return null;
      if (body.stations.length === 0) return { from: "bot", text: "조회된 주유소가 없어요." };
      return { from: "bot", title: `${body.area} ${chosen} 최저가`, fetchedAt: body.fetchedAt, stations: body.stations };
    });
  };

  const askDetail = (station: Station) =>
    ask(`${station.name} 자세히 알려 줘`, "detail", async () => {
      const { ok, body } = await getJson(`/api/stations/${station.id}`);
      return ok && body ? { from: "bot", detail: body } : null;
    });

  const askFixed = () => {
    const chosen = fuel;
    ask(fixedQuestion, "text", async () => {
      const { ok, body } = await getJson(`/api/fixed-question?${new URLSearchParams({ region: region.key, fuel: chosen })}`);
      return ok && body?.figures ? { from: "bot", notice: { text: body.text, figures: body.figures } } : null;
    });
  };

  function askFree(question: string) {
    // 카드 답변은 빼고 글로 오간 대화만 보낸다. 서버 한도(20턴)에 맞춰 최근 것만 쓰고, 첫 턴은 사용자여야 한다.
    const turns = [...messages, { from: "user" as const, text: question }]
      .flatMap((message) => ("text" in message ? [message] : []))
      .map((message) => ({ role: message.from === "user" ? "user" : "assistant", content: message.text }))
      .slice(-19);
    const history = turns.slice(turns.findIndex((turn) => turn.role === "user"));
    ask(question, "text", async () => {
      const { ok, body } = await getJson("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (ok && body?.text) return { from: "bot", text: body.text };
      return body?.error ? { from: "bot", text: body.error } : null;
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
    { label: fixedQuestion, onClick: askFixed },
    { label: FREE_EXAMPLE, onClick: () => askFree(FREE_EXAMPLE) },
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
              한국석유공사 오피넷에 보고된 가격으로 답하고, 그 가격이 언제 기준인지 함께 알려 드려요.
            </p>
            <ul className="mt-8 space-y-4">
              {suggestions.map((suggestion) => (
                <li key={suggestion.label}>
                  <button
                    type="button"
                    onClick={suggestion.onClick}
                    className="w-full rounded-2xl px-5 py-4 text-left font-medium shadow-raised transition-shadow hover:shadow-raised-sm active:shadow-inset"
                  >
                    {suggestion.label}
                  </button>
                </li>
              ))}
            </ul>
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
            <p
              key={index}
              className="w-fit max-w-[34rem] animate-rise whitespace-pre-line rounded-3xl rounded-bl-md p-4 text-[15px] leading-relaxed shadow-raised"
            >
              {message.text}
            </p>
          );
        })}

        {pending && <Skeleton kind={pending} />}
        <div ref={endRef} />
      </div>

      <div className="space-y-3 border-t border-hairline/70 px-4 pt-4 pb-4 sm:px-7 sm:pb-6">
        <div className="flex items-center gap-2.5">
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
          {(messages.length > 0 || busy) && (
            <div className="no-scrollbar -my-2 flex min-w-0 flex-1 gap-2.5 overflow-x-auto py-2 pr-1 pl-1 sm:flex-wrap sm:overflow-visible">
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
        </div>

        <form onSubmit={submit} className="flex items-center gap-3">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            placeholder="예: 언양 쪽 경유 제일 싼 곳 알려 줘"
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
