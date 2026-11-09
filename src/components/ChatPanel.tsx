"use client";

import { useState } from "react";

const FUELS = ["휘발유", "경유"];

type Message = { from: "user" | "bot"; text: string };
type Region = { key: string; name: string };

export default function ChatPanel({ question, regions }: { question: string; regions: Region[] }) {
  const [region, setRegion] = useState(regions[0].key);
  const [fuel, setFuel] = useState(FUELS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function askFixedQuestion() {
    setLoading(true);
    setMessages((current) => [...current, { from: "user", text: question }]);
    const params = new URLSearchParams({ region, fuel });
    let text = "답변을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.";
    try {
      const response = await fetch(`/api/fixed-question?${params}`);
      if (response.ok) {
        text = (await response.json()).text;
      }
    } catch {
      // 위의 안내 문구를 그대로 보여 준다.
    }
    setMessages((current) => [...current, { from: "bot", text }]);
    setLoading(false);
  }

  return (
    <section className="mt-6 rounded-lg border border-foreground/15 p-4">
      <div className="min-h-48 space-y-3">
        {messages.map((message, index) => (
          <p
            key={index}
            className={
              message.from === "user"
                ? "ml-auto w-fit max-w-[85%] rounded-lg bg-foreground px-3 py-2 text-sm text-background"
                : "w-fit max-w-[85%] rounded-lg bg-foreground/10 px-3 py-2 text-sm"
            }
          >
            {message.text}
          </p>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          aria-label="지역"
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          className="rounded border border-foreground/30 bg-background px-2 py-2 text-sm"
        >
          {regions.map((item) => (
            <option key={item.key} value={item.key}>
              {item.name}
            </option>
          ))}
        </select>
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
          onClick={askFixedQuestion}
          disabled={loading}
          className="rounded-full border border-foreground/40 px-4 py-2 text-sm disabled:opacity-50"
        >
          {question}
        </button>
      </div>

      <input
        disabled
        placeholder="자유 질문은 준비 중이에요"
        aria-label="자유 질문 입력"
        className="mt-3 w-full rounded border border-foreground/20 bg-transparent px-3 py-2 text-sm"
      />
    </section>
  );
}
