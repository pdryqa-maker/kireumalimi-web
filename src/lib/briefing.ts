// 오늘의 기름 소식: 오피넷 평균 판매가(전국, 내 지역)와 어제보다 얼마나 움직였는지.
// 평균가는 하루에 여러 번 새로 매겨지므로 1시간 동안 재사용해 하루 조회 한도를 아낀다.
import { fetchOpinetTimed } from "@/lib/opinet";
import { FUEL_TAX_CUT, PRICE_CAP } from "@/lib/policy";
import { areaName, FUEL_CODES, isAreaCode, kstTime, rows } from "@/lib/stations";

const AVERAGE_CACHE_MS = 60 * 60 * 1000;

export type Average = { price: number; diff: number };

function average(body: unknown, prodcd: string): Average | null {
  const row = rows(body).find((item) => String(item.PRODCD) === prodcd);
  const price = Number(row?.PRICE);
  const diff = Number(row?.DIFF);
  return row && price > 0 && Number.isFinite(diff) ? { price, diff } : null;
}

export async function fuelBriefing(fuel: string, area: string | null) {
  const prodcd = FUEL_CODES[fuel];
  if (!prodcd || (area !== null && !isAreaCode(area))) {
    throw new RangeError("지원하지 않는 유종 또는 지역입니다.");
  }
  const nationwide = await fetchOpinetTimed("avgAllPrice", {}, AVERAGE_CACHE_MS);
  let local: (Average & { area: string }) | null = null;
  if (area) {
    const query: Record<string, string> = area.length === 4 ? { sido: area.slice(0, 2), sigun: area, prodcd } : { sido: area, prodcd };
    const { body } = await fetchOpinetTimed(area.length === 4 ? "avgSigunPrice" : "avgSidoPrice", query, AVERAGE_CACHE_MS);
    const found = average(body, prodcd);
    if (found) local = { ...found, area: await areaName(area) };
  }
  const tradeDate = String(rows(nationwide.body)[0]?.TRADE_DT ?? "");
  return {
    fuel,
    // 평균가가 매겨진 날(오피넷 TRADE_DT)과 우리가 받아 온 시각
    date: /^\d{8}$/.test(tradeDate) ? `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6, 8)}` : null,
    fetchedAt: nationwide.fetchedAt,
    fetchedAtKst: kstTime(nationwide.fetchedAt),
    national: average(nationwide.body, prodcd),
    local,
  };
}

export type FuelBriefing = Awaited<ReturnType<typeof fuelBriefing>>;

const round1 = (value: number) => Math.round(value * 10) / 10;
const dashDate = (value: unknown) => {
  const text = String(value ?? "");
  return /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : null;
};

// 지금 최고가격이 몇 차 고시부터 같은 값이었는지. 기록한 차수를 거슬러 올라가고, 끝까지 같으면 처음 정한 고시(setBy)로 본다.
function sameSince(fuel: string) {
  const rounds = PRICE_CAP.rounds;
  const capWon = rounds.at(-1)!.prices[fuel];
  let index = rounds.length - 1;
  while (index > 0 && rounds[index - 1].prices[fuel] === capWon) index--;
  if (index === 0 && PRICE_CAP.setBy.prices[fuel] === capWon) {
    return { round: PRICE_CAP.setBy.round, startsOn: PRICE_CAP.setBy.startsOn };
  }
  return { round: rounds[index].round, startsOn: rounds[index].startsOn };
}

// 가격 해설: 내 지역 평균이 어제보다, 전국 평균이 지난 7일 동안 얼마나 움직였는지와
// 그 기간에 정해져 있던 제도(최고가격, 유류세 인하)를 한데 모은다. 원인을 단정하지 않고 이 값들로만 설명하게 한다.
export async function priceStory(fuel: string, area: string | null) {
  const prodcd = FUEL_CODES[fuel];
  const brief = await fuelBriefing(fuel, area);
  const { body } = await fetchOpinetTimed("avgRecentPrice", {}, AVERAGE_CACHE_MS);
  const week = rows(body)
    .filter((row) => String(row.PRODCD) === prodcd)
    .map((row) => ({ date: dashDate(row.DATE), price: Number(row.PRICE) }))
    .filter((day): day is { date: string; price: number } => day.date !== null && day.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = week[0];
  const last = week.at(-1);

  const capRound = PRICE_CAP.rounds.at(-1)!;
  const capWon = capRound.prices[fuel] ?? null;
  const previousCap = PRICE_CAP.rounds.at(-2)?.prices[fuel] ?? null;
  const reference = brief.local ?? (brief.national ? { ...brief.national, area: "전국" } : null);
  const tax = FUEL_TAX_CUT.fuels[fuel] ?? null;

  return {
    fuel,
    date: brief.date,
    fetchedAtKst: brief.fetchedAtKst,
    local: brief.local ? { area: brief.local.area, averageWon: round1(brief.local.price), sinceYesterdayWon: round1(brief.local.diff) } : null,
    national: brief.national ? { averageWon: round1(brief.national.price), sinceYesterdayWon: round1(brief.national.diff) } : null,
    nationalWeek:
      first && last && first !== last
        ? { from: first.date, to: last.date, fromWon: round1(first.price), toWon: round1(last.price), changeWon: round1(last.price - first.price) }
        : null,
    priceCap:
      capWon === null
        ? { applies: false, note: `${fuel}은 석유 최고가격 대상이 아닙니다(휘발유, 경유, 실내등유만).` }
        : {
            applies: true,
            round: capRound.round,
            startsOn: capRound.startsOn,
            capWon,
            changeFromPreviousWon: previousCap === null ? null : capWon - previousCap,
            sameSince: sameSince(fuel),
            meaning: PRICE_CAP.meaning,
            // 평균 판매가와 공급가 상한의 차이. 차이가 왜 생기는지는 단정하지 않고 차이만 말한다.
            averageVsCap: reference
              ? {
                  area: reference.area,
                  averageWon: round1(reference.price),
                  diffWon: round1(reference.price - capWon),
                  note: "diffWon이 +면 평균 판매가가 공급가 상한보다 높고, -면 낮습니다.",
                }
              : null,
          },
    fuelTaxCut: tax
      ? { endsOn: FUEL_TAX_CUT.endsOn, decidedOn: FUEL_TAX_CUT.decidedOn, wonPerLiter: tax.wonPerLiter, note: "인하 중이라 지금 가격에 이미 반영돼 있습니다." }
      : null,
    note: "국제유가나 환율처럼 이 결과에 없는 원인은 말하지 않습니다. 앞으로의 가격도 예측하지 않습니다.",
  };
}
