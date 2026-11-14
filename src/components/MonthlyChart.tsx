"use client";

// 월별 쓴 돈 점 그래프. 달마다 점을 아래부터 쌓고(점 하나 = unit원, 나머지는 반쯤 찬 점), 고른 달만 불꽃색이다.
// 뒤에는 옅은 점 격자를 깔아 기록이 없어도 빈 격자로 보인다. 첫 기록 전 달은 이름을 흐리게 둔다. 휴대폰은 최근 6달만 보인다.
import { MAX_DOTS, type MonthSpend } from "@/lib/fillTotals";
import { wonName } from "@/lib/fillAmount";

const PITCH = 10; // 점 8px + 간격 2px
const ROWS = MAX_DOTS + 1; // 가장 많이 쓴 달의 온전한 점 24개 + 반 점 하나
export const PHONE_MONTHS = 6;

export const monthName = (month: string) => `${Number(month.slice(5))}월`;
export const spendText = (won: number) => (won > 0 ? wonName(won) : "0원");

const GRID = {
  height: ROWS * PITCH,
  backgroundImage: "radial-gradient(circle, var(--hairline) 2px, transparent 2.5px)",
  backgroundSize: `${PITCH}px ${PITCH}px`,
  backgroundPosition: "center bottom",
};
const HALF = { background: "linear-gradient(to top, currentColor 50%, transparent 50%)", boxShadow: "inset 0 0 0 1.5px currentColor" };

export function MonthlyChart({
  months,
  unit,
  selected,
  onSelect,
}: {
  months: MonthSpend[];
  unit: number;
  selected: string;
  onSelect: (month: string) => void;
}) {
  return (
    <ol className="flex items-end gap-1 sm:gap-2">
      {months.map((item, index) => {
        const before = item.state === "before";
        const on = item.month === selected;
        const full = before ? 0 : Math.floor(item.won / unit);
        const half = !before && item.won % unit > 0;
        const amount = before ? "기록 전" : spendText(item.won);
        const notes = [
          item.state === "partial" ? "앞쪽 기록 일부만 남은 달" : "",
          item.wonUnknownFills > 0 ? `금액 모르는 주유 ${item.wonUnknownFills}번 빠짐` : "",
        ].filter(Boolean);
        return (
          <li key={item.month} className={`min-w-0 flex-1 ${index < months.length - PHONE_MONTHS ? "hidden md:block" : ""}`}>
            <button
              type="button"
              disabled={before}
              aria-pressed={on}
              aria-label={[`${monthName(item.month)} ${amount}`, ...notes].join(", ")}
              onClick={() => onSelect(item.month)}
              className={`group relative flex w-full flex-col items-center rounded-2xl pt-7 pb-1.5 disabled:cursor-default ${
                on ? "text-flame" : "text-ink hover:bg-canvas"
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute top-1 rounded-full px-1.5 text-[11px] font-semibold whitespace-nowrap tabular-nums ${
                  on ? "visible" : "invisible group-hover:visible group-focus-visible:visible"
                }`}
              >
                {amount}
              </span>
              <span aria-hidden="true" className="flex w-full flex-col-reverse items-center gap-[2px] pb-px" style={GRID}>
                {Array.from({ length: full }, (_, dot) => (
                  <span key={dot} className="size-2 shrink-0 rounded-full bg-current" />
                ))}
                {half && <span className="size-2 shrink-0 rounded-full" style={HALF} />}
              </span>
              <span aria-hidden="true" className={`mt-2 text-xs whitespace-nowrap ${on ? "font-semibold" : before ? "text-ink-soft/50" : "text-ink-soft"}`}>
                {monthName(item.month)}
              </span>
              {/* 좁은 칸에서도 한 줄에 들어가는 짧은 표시만 둔다. 자세한 말은 aria-label과 그래프 아래 설명에 있다. */}
              <span aria-hidden="true" className="h-4 text-[10px] whitespace-nowrap text-ink-soft">
                {item.state === "partial" ? "일부" : !before && item.wonUnknownFills > 0 ? "모름" : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
