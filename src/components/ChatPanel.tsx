"use client";

import { useState } from "react";

const FUELS = ["휘발유", "경유"];
const ERROR_TEXT = "답변을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.";

type Region = { key: string; area: string; name: string };
type Station = { id: string; name: string; brand: string; price: number; address: string };
type StationDetail = {
  name: string;
  brand: string;
  phone: string;
  qualityCertified: boolean;
  prices: { fuel: string; price: number; updatedAt: string | null }[];
};
type Message =
  | { from: "user" | "bot"; text: string }
  | { from: "bot"; stations: Station[] }
  | { from: "bot"; detail: StationDetail };

async function getJson(url: string) {
  try {
    const response = await fetch(url);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

const won = (price: number) => `${price.toLocaleString("ko-KR")}원`;

// "2026-11-11 07:10" → "11월 11일 07:10 기준"
function basis(updatedAt: string | null) {
  if (!updatedAt) return "기준 시각 정보 없음";
  const [date, time] = updatedAt.split(" ");
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일 ${time} 기준`;
}

export default function ChatPanel({ fixedQuestion, region }: { fixedQuestion: string; region: Region }) {
  const [fuel, setFuel] = useState(FUELS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function ask(question: string, answer: () => Promise<Message>) {
    setLoading(true);
    setMessages((current) => [...current, { from: "user", text: question }]);
    const reply = await answer();
    setMessages((current) => [...current, reply]);
    setLoading(false);
  }

  const askCheapest = () =>
    ask(`${region.name}에서 제일 싼 ${fuel} 어디야?`, async () => {
      const body = await getJson(`/api/stations/cheapest?${new URLSearchParams({ fuel, area: region.area })}`);
      if (!body) return { from: "bot", text: ERROR_TEXT };
      if (body.stations.length === 0) return { from: "bot", text: "조회된 주유소가 없어요." };
      return { from: "bot", stations: body.stations };
    });

  const askDetail = (station: Station) =>
    ask(`${station.name} 자세히 알려 줘`, async () => {
      const detail = await getJson(`/api/stations/${station.id}`);
      return detail ? { from: "bot", detail } : { from: "bot", text: ERROR_TEXT };
    });

  const [draft, setDraft] = useState("");

  function askFree(event: React.FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question) return;
    setDraft("");
    // 카드 답변은 빼고 글로 오간 대화만 보낸다. 서버 한도(20턴)에 맞춰 최근 것만 쓰고, 첫 턴은 사용자여야 한다.
    const turns = [...messages, { from: "user" as const, text: question }]
      .filter((message): message is { from: "user" | "bot"; text: string } => "text" in message)
      .map((message) => ({ role: message.from === "user" ? "user" : "assistant", content: message.text }))
      .slice(-19);
    const history = turns.slice(turns.findIndex((turn) => turn.role === "user"));
    ask(question, async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });
        const body = await response.json();
        return { from: "bot", text: body.text ?? body.error ?? ERROR_TEXT };
      } catch {
        return { from: "bot", text: ERROR_TEXT };
      }
    });
  }

  const askFixed = () =>
    ask(fixedQuestion, async () => {
      const body = await getJson(`/api/fixed-question?${new URLSearchParams({ region: region.key, fuel })}`);
      return { from: "bot", text: body?.text ?? ERROR_TEXT };
    });

  return (
    <section className="mt-6 rounded-lg border border-foreground/15 p-4">
      <div className="min-h-48 space-y-3">
        {messages.map((message, index) => {
          if ("stations" in message) {
            return (
              <div key={index} className="max-w-[85%] rounded-lg bg-foreground/10 p-3 text-sm">
                <ol className="space-y-2">
                  {message.stations.map((station, rank) => (
                    <li key={station.id} className="flex items-center gap-3">
                      <span className="w-4 text-foreground/60">{rank + 1}</span>
                      <div className="flex-1">
                        <p className="font-semibold">
                          {station.name} <span className="font-normal text-foreground/60">{station.brand}</span>
                        </p>
                        <p className="text-xs text-foreground/60">{station.address}</p>
                      </div>
                      <span className="font-semibold">{won(station.price)}</span>
                      <button
                        type="button"
                        onClick={() => askDetail(station)}
                        disabled={loading}
                        className="rounded border border-foreground/30 px-2 py-1 text-xs disabled:opacity-50"
                      >
                        자세히
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-foreground/60">오피넷 보고 가격이에요. 주유소에서 바뀌었을 수 있어요.</p>
              </div>
            );
          }
          if ("detail" in message) {
            const { detail } = message;
            return (
              <div key={index} className="max-w-[85%] rounded-lg bg-foreground/10 p-3 text-sm">
                <p className="font-semibold">
                  {detail.name} <span className="font-normal text-foreground/60">{detail.brand}</span>
                </p>
                <ul className="mt-2 space-y-1">
                  {detail.prices.map((price) => (
                    <li key={price.fuel}>
                      {price.fuel} {won(price.price)}{" "}
                      <span className="text-xs text-foreground/60">· {basis(price.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-foreground/60">
                  {detail.phone && `전화 ${detail.phone} · `}품질인증 {detail.qualityCertified ? "있음" : "없음"}
                </p>
              </div>
            );
          }
          return (
            <p
              key={index}
              className={
                message.from === "user"
                  ? "ml-auto w-fit max-w-[85%] rounded-lg bg-foreground px-3 py-2 text-sm text-background"
                  : "w-fit max-w-[85%] whitespace-pre-line rounded-lg bg-foreground/10 px-3 py-2 text-sm"
              }
            >
              {message.text}
            </p>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          aria-label="유종"
          value={fuel}
          onChange={(event) => setFuel(event.target.value)}
          className="rounded border border-foreground/30 bg-background px-2 py-2 text-sm"
        >
          {FUELS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={askCheapest}
          disabled={loading}
          className="rounded-full border border-foreground/40 px-4 py-2 text-sm disabled:opacity-50"
        >
          {region.name}에서 제일 싼 {fuel} 어디야?
        </button>
        <button
          type="button"
          onClick={askFixed}
          disabled={loading}
          className="rounded-full border border-foreground/40 px-4 py-2 text-sm disabled:opacity-50"
        >
          {fixedQuestion}
        </button>
      </div>

      <form onSubmit={askFree} className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          placeholder="예: 언양 근처 경유 제일 싼 곳 알려 줘"
          aria-label="질문 입력"
          className="flex-1 rounded border border-foreground/30 bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !draft.trim()}
          className="rounded bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
        >
          {loading ? "답변 중" : "보내기"}
        </button>
      </form>
    </section>
  );
}
