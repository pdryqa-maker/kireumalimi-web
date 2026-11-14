"use client";

import Link from "next/link";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { AlertProposal, DashboardProposal, FillProposal } from "@/lib/chatbot";
import { buildNotices, kstClock, scheduleNotices, type Personal } from "@/lib/conditions";
import type { FuelReport } from "@/lib/fuelReport";
import { amountName, amountQuery, fullLiters, wonName, type Amount } from "@/lib/fillAmount";
import { addDays, forecastNextFill, MAX_RECORDS, MIN_RECORDS, type FillForecast } from "@/lib/fillForecast";
import { fuelEconomy, measuredKmpl, readingBasis } from "@/lib/fuelEconomy";
import { favoriteStation, fillPlan, monthProjection } from "@/lib/personal";
import { DEFAULT_PLACE } from "@/lib/places";
import { priceCapNotice } from "@/lib/policy";
import { fuelName, saveProfile, signedIn, type Profile } from "@/lib/profile";
import { addAlert, alertStore, parseAlerts } from "@/lib/savedAlerts";
import { fillStore, parseFills, saveFills } from "@/lib/savedFills";
import { addLedgerEntry, ledgerForMonth, ledgerForServer, ledgerStore, markFill, mergeLedger, parseLedger } from "@/lib/savedLedger";
import { parseWatch, watchStore } from "@/lib/watchSettings";
import {
  AlertCard,
  AlertCheckCard,
  CapCard,
  capMessage,
  CostCard,
  DashboardCard,
  FillProposalCard,
  fuelLabel,
  TaxCard,
  type AlertCheck,
  type AlertStatus,
  type CapNotice,
  type CostResult,
  type CostStation,
  type FillMark,
  type PriceRow,
  type TaxImpact,
} from "./AnswerCards";
import { ConditionBar, initialPlace, MY, placeLabel, usablePlace } from "./ConditionBar";
import { FillLogCard, ForecastCard, forecastMessage, ReportCard, reportSummary } from "./FillCards";
import { FuelNews, newsHeadline, useBriefing } from "./FuelNews";
import { basis, dayWithWeekday, koreanTime, monthDay, PUMP_NOTE, won } from "./format";
import { CameraIcon, ChartIcon, PinIcon, PumpIcon, ReceiptIcon } from "./icons";
import { fetchFill, useFullLiters } from "./useFill";
import { shrinkPhoto, type Photo } from "./photo";
import { useMounted, useProfile, useStored } from "./useStored";

const ERROR_TEXT = "답변을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.";
const ALERT_EXAMPLE = "경유 1,750원 밑으로 내려가면 알려 줘";
const CAP_QUESTION = "최고가격 고시, 쉽게 설명해 줘";
const FORECAST_QUESTION = "내 기록으로 다음 주유일 알려 줘";
const RECEIPT_QUESTION = "영수증 사진으로 주유 기록 남겨 줘";
const PHOTO_QUESTION = "이 사진으로 주유 기록이나 연비 남겨 줘";
const EXPLAIN_QUESTION = "요즘 기름값 왜 이래?";
const REPORT_QUESTION = "이번 달 주유 리포트 보여 줘";
// 서버가 받는 대화 한도(20턴, 한 턴 500자)에 맞춘다.
const MAX_HISTORY = 19;
const MAX_TURN_LENGTH = 500;
// 알림 카드 구분용 번호. 화면 상태에 쓰지 않으므로 모듈 변수로 둔다.
let alertSeq = 0;

type Region = { key: string; area: string; name: string };
type Station = { id: string; name: string; brand: string; price: number; address?: string; distanceKm?: number };
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
  | { from: "bot"; summary: string; fill: FillProposal; status: AlertStatus; id: number }
  | {
      from: "bot";
      summary: string;
      dashboard: DashboardProposal;
      kmplStatus: AlertStatus;
      odometerStatus: AlertStatus;
      id: number;
    }
  | { from: "bot"; summary: string; cap: CapNotice }
  | { from: "bot"; summary: string; fillForm: true }
  | { from: "bot"; summary: string; forecast: FillForecast; forecastCost: CostResult | null }
  | { from: "bot"; summary: string; report: FuelReport }
  | { from: "bot"; error: string; retry: () => void };
type Message = { from: "user"; text: string; photo?: string } | Reply;
type Turn = { role: "user" | "assistant"; content: string };
type Starter = { label: string; onClick: () => void; Icon?: (props: { className?: string }) => React.ReactNode };

const fillSummary = (fill: FillProposal, status: AlertStatus) =>
  `영수증에서 읽은 주유 기록: ${fill.date} ${fill.litersOnReceipt}L(${{ proposed: "넣기 전", saved: "기록에 넣음", unsaved: "저장 못 함", dismissed: "넣지 않음" }[status]})`;

const STATUS_WORD = { proposed: "확인 전", saved: "반영함", unsaved: "저장 못 함", dismissed: "반영 안 함" };
const dashboardSummary = (dashboard: DashboardProposal, kmplStatus: AlertStatus, odometerStatus: AlertStatus) =>
  `계기판에서 읽은 값:${dashboard.odometerKm ? ` 누적 주행거리 ${dashboard.odometerKm}km(${STATUS_WORD[odometerStatus]})` : ""}` +
  `${dashboard.averageKmpl ? ` 평균 연비 ${dashboard.averageKmpl}km/L(${STATUS_WORD[kmplStatus]})` : ""}`;

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
  return `${cost.place} 출발 ${cost.fuel} ${cost.fill.label} 실질비용 순(연비 ${cost.kmpl}km/L, 직선 왕복, ${koreanTime(cost.fetchedAt)} 조회): ${rows}`;
}

function taxSummary(tax: TaxImpact, cost: CostResult | null) {
  const best = cost?.stations[0];
  return (
    `유류세 인하는 ${tax.endsOn} 종료 예정(${tax.decidedOn} 연장 결정). 끝나면 ` +
    (tax.fill && tax.maxExtraWon !== null
      ? `${tax.fuel} ${tax.fill.label}에 최대 ${won(tax.maxExtraWon)}원 더 듦(리터당 ${tax.wonPerLiter}원).`
      : `${tax.fuel} 리터당 최대 ${tax.wonPerLiter}원 더 듦.`) +
    (best && cost ? ` ${cost.place} 출발 거리까지 고려한 추천: ${best.name} 리터당 ${won(best.price)}원.` : "")
  );
}

function capSummary(cap: CapNotice) {
  const diff =
    cap.maxDiffWon === null || cap.changeWon === 0 || !cap.fill
      ? ""
      : ` ${fuelLabel(cap.fuel)} ${cap.fill.label} 기준 최대 ${won(cap.maxDiffWon)}원 차이.`;
  return `${capMessage(cap)}${diff}`;
}

function forecastSummary(forecast: FillForecast, cost: CostResult | null) {
  const records = forecast.records
    .map((record) => `${record.date} ${record.won ? wonName(record.won) : `${record.liters}L`}`)
    .join(", ");
  return (
    `주유 기록(${records}) 기준 다음 주유 예상 ${forecast.nextDate}, 평균 ${forecast.avgGapDays}일 간격, 알림일 ${forecast.notifyOn}. ` +
    forecastMessage(forecast, cost)
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

// 시간대 인사(한국 시간). 오늘의 기름 소식을 아직 못 받았을 때만 쓴다.
function greeting(hour: number) {
  if (hour >= 5 && hour < 11) return "좋은 아침이에요";
  if (hour >= 11 && hour < 14) return "점심은 드셨어요?";
  if (hour >= 14 && hour < 18) return "오후도 힘내세요";
  if (hour >= 18 && hour < 22) return "오늘 하루 수고 많으셨어요";
  return "늦은 시간까지 수고 많으세요";
}

// 다음에 받을 알림 한 줄. 내 알림 조건에 켜 둔 제도·예보 조건으로 셈하고, 보낼 알림이 없으면 null.
function nextNotice(profile: Profile) {
  const watch = parseWatch(watchStore.read());
  const { today } = kstClock();
  // 보낼 날만 쓰므로 오피넷 값(평균가·리터 환산)은 셈하지 않는다. 한 달 주행거리 예보는 가득일 때만 리터를 안다.
  const entries = mergeLedger(parseLedger(ledgerStore.read()), parseFills(fillStore.read()));
  const fillLiters = profile.amount === "full" ? fullLiters(entries, profile.fullLiters).liters : null;
  const plan = fillPlan({ entries, monthlyKm: profile.monthlyKm, kmpl: fuelEconomy(profile).kmpl, fillLiters, today });
  const personal: Personal = {
    plan,
    cost: null,
    tax: null,
    projection: monthProjection({ entries, plan, perFillWon: plan?.typicalWon ?? null, today }),
    amount: profile.amount,
    monthlyKm: profile.monthlyKm,
    favoriteName: favoriteStation(entries, today)?.name ?? null,
    ureaNeeded: profile.ureaNeeded,
  };
  const notices = buildNotices({
    watch,
    car: { fuel: profile.fuel, fill: null },
    alerts: parseAlerts(alertStore.read()),
    checks: {},
    personal,
    today,
  });
  const first = scheduleNotices(notices)[0];
  if (!first) return null;
  const when = first.now ? "지금" : first.sendOn === today ? "오늘" : first.sendOn === addDays(today, 1) ? "내일" : dayWithWeekday(first.sendOn);
  return `${when} · ${first.title}`;
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

// 시작 화면의 큰 질문 카드 4개와 작은 칩
function StarterList({ cards, chips, children }: { cards: Starter[]; chips: Starter[]; children?: React.ReactNode }) {
  return (
    <>
      <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, onClick, Icon }) => (
          <li key={label}>
            <button
              type="button"
              onClick={onClick}
              className="flex h-full min-h-[6.75rem] w-full flex-col justify-between gap-3 rounded-2xl bg-canvas p-4 text-left text-[15px] leading-snug font-medium transition-colors hover:bg-flame-soft lg:min-h-[8.5rem]"
            >
              {Icon && <Icon className="size-6 text-flame" />}
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button key={chip.label} type="button" onClick={chip.onClick} className="rounded-full px-3.5 py-2 text-sm shadow-raised-sm hover:bg-canvas">
            {chip.label}
          </button>
        ))}
        {children}
      </div>
    </>
  );
}

// 대화 중 입력창 위의 추천 질문 줄
function SuggestionRow({ suggestions, busy }: { suggestions: Starter[]; busy: boolean }) {
  return (
    <div className="no-scrollbar -my-2 flex gap-2.5 overflow-x-auto py-2 pr-1 pl-1 lg:flex-wrap lg:overflow-visible">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.label}
          type="button"
          onClick={suggestion.onClick}
          disabled={busy}
          className="shrink-0 rounded-full px-3 py-1.5 text-sm whitespace-nowrap shadow-raised-sm transition-shadow hover:shadow-raised active:shadow-inset-sm disabled:opacity-50"
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}

// 대시보드(탐색·내 기록)가 결과 패널에서 실행하는 기능. 누를 때마다 새 대화로 시작한다.
export type PanelCommand =
  | { kind: "nearby" }
  | { kind: "totalCost" }
  | { kind: "ask"; question: string }
  | { kind: "photo"; question: string }
  | { kind: "report"; month: string }
  | { kind: "fillForm" }
  | { kind: "forecast"; forecast: FillForecast };
export type PanelHandle = { run: (command: PanelCommand) => void };
export type PanelConditions = { fuel: string; place: string; amount: Amount };

export default function ChatPanel({
  fixedQuestion,
  region,
  variant = "page",
  conditions,
  ref,
  onActivity,
  examples = [],
}: {
  fixedQuestion: string;
  region: Region;
  // page: 홈 화면 전체 챗봇. panel: 대시보드 안 결과 패널(시작 화면·조건 줄·추천 줄 없음)
  variant?: "page" | "panel";
  // 대시보드의 조건 줄 값. 주면 이 안의 조건 줄 대신 쓴다.
  conditions?: PanelConditions;
  ref?: React.Ref<PanelHandle>;
  onActivity?: (state: { busy: boolean; hasMessages: boolean }) => void;
  // 패널이 비어 있을 때 보여 줄 예시 질문
  examples?: string[];
}) {
  const profile = useProfile();
  const mounted = useMounted();
  const isPanel = variant === "panel";
  // 화면에서 고른 값이 있으면 그 값, 없으면 내 정보(로그인 전에는 기본값)를 쓴다.
  const [fuelChoice, setFuel] = useState<string | null>(null);
  const [placeChoice, setPlace] = useState<string | null>(null);
  const [amountChoice, setAmount] = useState<Amount | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<SkeletonKind | null>(null);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // 대시보드의 '찍기' 버튼은 휴대폰에서 카메라를 바로 연다(capture). 입력창 사진 버튼은 앨범에서도 고를 수 있게 그대로 둔다.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // 대화 번호. 새 대화를 시작하면 올린다. 앞 대화의 늦게 온 답은 번호가 달라 붙이지 않는다.
  const threadRef = useRef(0);
  // 사진 고르기를 연 질문(영수증·계기판). 입력창 버튼이면 null. 사진을 고르기 전에 화면이 다시 그려지므로 상태로 둔다.
  const [photoQuestion, setPhotoQuestion] = useState<string | null>(null);
  // 대시보드 버튼으로 연 사진 고르기는 사진을 고른 뒤에 새 대화로 시작한다(취소하면 지금 대화를 그대로 둔다).
  const photoFreshRef = useRef(false);
  const pickPhotoFor = (question: string | null, fresh = false, camera = false) => {
    setPhotoQuestion(question);
    photoFreshRef.current = fresh;
    (camera ? cameraInputRef : photoInputRef).current?.click();
  };
  useStored(alertStore, parseAlerts);
  useStored(watchStore, parseWatch);
  const fills = useStored(fillStore, parseFills);
  const ledger = useStored(ledgerStore, parseLedger);
  const fuel = conditions?.fuel ?? fuelChoice ?? profile.fuel;
  const amount = conditions?.amount ?? amountChoice ?? profile.amount;
  const fullTank = useFullLiters(profile.fullLiters);
  const place = usablePlace(conditions?.place ?? placeChoice ?? initialPlace(profile), profile);
  const placeName = placeLabel(place, profile);
  const homeArea = profile.area ?? { code: region.area, name: region.name };
  const loggedIn = mounted && signedIn(profile);
  // 제도 금액 질문의 말: "5만원어치 넣는 데", "가득 넣는 데"
  const amountPhrase = (chosen: Amount) => `${chosen === "full" ? "가득" : amountName(chosen)} 넣는 데`;

  // 출발 위치 조회 값: 내 위치면 좌표와 이름, 아니면 읍면 키
  const originQuery = (chosen: string): Record<string, string> =>
    chosen === MY && profile.location
      ? { x: String(profile.location.x), y: String(profile.location.y), label: profile.location.label }
      : { place: chosen === MY ? DEFAULT_PLACE : chosen };

  useEffect(() => {
    // 첫 화면에서는 인사말이 보이도록 대화가 시작된 뒤에만 아래로 내린다.
    if (messages.length === 0 && !pending) return;
    // 패널은 대화 목록만 내린다. scrollIntoView는 창까지 움직여, 대시보드를 내려 둔 채 상자를 누르면 페이지가 위로 끌려간다.
    const list = listRef.current;
    if (isPanel && list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    else endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, isPanel]);

  const busy = pending !== null;
  const hasMessages = messages.length > 0;
  useEffect(() => {
    onActivity?.({ busy, hasMessages });
  }, [busy, hasMessages, onActivity]);

  async function run(kind: SkeletonKind, answer: () => Promise<Reply | Reply[] | null>) {
    const thread = threadRef.current;
    setPending(kind);
    const reply = await answer();
    // 그사이 새 대화를 시작했으면 이 답은 버린다.
    if (thread !== threadRef.current) return;
    const retry = () => {
      setMessages((current) => current.filter((message) => !("retry" in message && message.retry === retry)));
      run(kind, answer);
    };
    const replies = reply === null ? [{ from: "bot" as const, error: ERROR_TEXT, retry }] : [reply].flat();
    setMessages((current) => [...current, ...replies]);
    setPending(null);
  }

  function ask(question: string, kind: SkeletonKind, answer: () => Promise<Reply | Reply[] | null>, photo?: string) {
    setMessages((current) => [...current, { from: "user", text: question, photo }]);
    run(kind, answer);
  }

  // 새 대화: 앞 대화와 아직 안 온 답을 버린다.
  function startThread() {
    threadRef.current += 1;
    setMessages([]);
    setPending(null);
  }

  const cheapestQuestion = profile.location
    ? `${profile.location.label} 근처 제일 싼 ${fuelName(fuel)} 어디야?`
    : `${homeArea.name}에서 제일 싼 ${fuelName(fuel)} 어디야?`;

  // 반경 5km 최저가. origin 없이 부르면 홈처럼 내 위치(없으면 내 지역 최저가)를 쓴다.
  const askCheapest = (origin?: string) => {
    const chosen = fuel;
    const near = origin ?? (profile.location ? MY : null);
    const question = origin ? `${placeLabel(origin, profile)} 근처 제일 싼 ${fuelName(chosen)} 어디야?` : cheapestQuestion;
    ask(question, "list", async () => {
      const url = near
        ? `/api/stations/nearby?${new URLSearchParams({ fuel: chosen, ...originQuery(near) })}`
        : `/api/stations/cheapest?${new URLSearchParams({ fuel: chosen, area: homeArea.code })}`;
      const { ok, body } = await getJson(url);
      if (!ok || !body) return body?.error ? { from: "bot", text: body.error } : null;
      if (body.stations.length === 0) {
        return { from: "bot", text: near ? `${body.place} 반경 ${body.radiusKm}km 안에서 가격을 알린 주유소가 없어요.` : "조회된 주유소가 없어요." };
      }
      const title = near ? `${body.place} 반경 ${body.radiusKm}km ${fuelName(chosen)} 최저가` : `${body.area} ${fuelName(chosen)} 최저가`;
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
    const [chosenFuel, chosenPlace, chosenAmount] = [fuel, place, amount];
    ask(`${placeName}에서 거리까지 따지면 ${fuelName(chosenFuel)} 어디가 나아?`, "list", async () => {
      const query = new URLSearchParams({
        fuel: chosenFuel,
        ...originQuery(chosenPlace),
        ...amountQuery(chosenAmount, fullTank),
        kmpl: String(profile.kmpl),
      });
      const { ok, body } = await getJson(`/api/stations/total-cost?${query}`);
      if (!ok || !body) return body?.error ? { from: "bot", text: body.error } : null;
      if (body.stations.length === 0) {
        return { from: "bot", text: `${body.place} 반경 ${body.radiusKm}km 안에서 ${chosenFuel} 가격을 알린 주유소가 없어요.` };
      }
      return { from: "bot", cost: body, summary: costSummary(body) };
    });
  };

  const askTax = () => {
    const [chosenFuel, chosenPlace, chosenAmount] = [fuel, place, amount];
    ask(`유류세 인하 끝나면 ${fuelName(chosenFuel)} ${amountPhrase(chosenAmount)} 얼마 더 들어?`, "text", async () => {
      const query = new URLSearchParams({
        fuel: chosenFuel,
        ...originQuery(chosenPlace),
        ...amountQuery(chosenAmount, fullTank),
        kmpl: String(profile.kmpl),
      });
      const { ok, body } = await getJson(`/api/alert-preview?${query}`);
      if (!ok || !body?.tax) return body?.error ? { from: "bot", text: body.error } : null;
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

  const askCap = () => {
    const [chosenFuel, chosenAmount] = [fuel, amount];
    ask(CAP_QUESTION, "text", async () => {
      // 금액을 리터로 바꿀 평균가를 못 받으면 리터당 값만 보여 준다.
      const fill = await fetchFill(chosenFuel, chosenAmount, fullTank);
      const result = priceCapNotice(chosenFuel, fill?.liters ?? null);
      if (typeof result.error === "string") return { from: "bot", text: result.error };
      const cap = { ...result, fill } as CapNotice;
      return { from: "bot", cap, summary: capSummary(cap) };
    });
  };

  const askForecast = () =>
    ask(FORECAST_QUESTION, "text", async () => ({
      from: "bot",
      fillForm: true,
      summary: "주유 기록 입력 카드를 보여 줌. 이용자가 날짜와 금액을 넣고 계산을 누르면 다음 주유일을 알려 줌.",
    }));

  // 한 달 주유 리포트. AI 없이 장부로 셈하고, 단가는 그날 시도 평균과 비교한다. 장부는 그 달과 전달 기록만 보낸다.
  const askReport = (month: string) => {
    const question = month === kstClock().today.slice(0, 7) ? REPORT_QUESTION : `${Number(month.slice(5))}월 주유 리포트 보여 줘`;
    ask(question, "detail", async () => {
      const { ok, body } = await getJson("/api/fuel-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledger: ledgerForMonth(month), profile, month }),
      });
      if (!ok || !body?.month) return body?.error ? { from: "bot", text: body.error } : null;
      return { from: "bot", report: body, summary: reportSummary(body) };
    });
  };

  // 다음 주유일과 그날 넣을 곳. save: false면 주유 기록을 덮어쓰지 않는다(내 기록에서 장부로 셈한 예보).
  function submitForecast(forecast: FillForecast, { save = true }: { save?: boolean } = {}) {
    const [chosenFuel, chosenPlace] = [fuel, place];
    if (save) saveFills(forecast.records);
    ask(`주유 기록 ${forecast.records.length}번으로 다음 주유일 계산해 줘`, "text", async () => {
      // 추천은 기록에서 보통 넣는 금액(없으면 리터, 그것도 없으면 내 차 설정)으로 셈한다.
      const typical: Record<string, string> =
        forecast.typicalWon !== null
          ? { amount: String(forecast.typicalWon) }
          : forecast.typicalLiters !== null
            ? { liters: String(forecast.typicalLiters) }
            : amountQuery(profile.amount, fullTank);
      const query = new URLSearchParams({
        fuel: chosenFuel,
        ...originQuery(chosenPlace),
        ...typical,
        kmpl: String(profile.kmpl),
      });
      // 추천은 오피넷이 안 될 때 빼고 보여 준다. 예상일은 기록만으로 셈한 값이라 그대로 쓸 수 있다.
      const { ok, body } = await getJson(`/api/stations/total-cost?${query}`);
      const cost: CostResult | null = ok && body?.stations ? body : null;
      return { from: "bot", forecast, forecastCost: cost, summary: forecastSummary(forecast, cost) };
    });
  }

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

  // fresh: 새 대화로 시작한 질문이라 앞 대화 기록을 보내지 않는다.
  function askFree(question: string, photo?: Photo, fresh = false) {
    const history = toTurns([...(fresh ? [] : messages), { from: "user", text: question }]);
    const screen = { fuel, amount, place };
    ask(question, "text", async () => {
      const { ok, body } = await getJson("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 내 정보(이름, 위치, 차)는 서버가 다시 검사해 답을 맞추는 데만 쓴다. 사진은 이번 질문에만 붙인다.
        body: JSON.stringify({
          messages: history,
          profile: loggedIn ? profile : undefined,
          image: photo ? { mediaType: photo.mediaType, data: photo.data } : undefined,
          // 주유 장부는 리포트·주유소 점검 도구가 쓸 때만 AI에 들어간다.
          ledger: ledgerForServer(),
          // 조건 줄의 유종·금액·출발 위치. 질문에 따로 말하지 않으면 이 값으로 조회한다.
          conditions: screen,
        }),
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
      if (body.fill) {
        replies.push({ from: "bot", fill: body.fill, status: "proposed", id: alertSeq++, summary: fillSummary(body.fill, "proposed") });
      }
      if (body.dashboard) {
        replies.push({
          from: "bot",
          dashboard: body.dashboard,
          kmplStatus: "proposed",
          odometerStatus: "proposed",
          id: alertSeq++,
          summary: dashboardSummary(body.dashboard, "proposed", "proposed"),
        });
      }
      return replies;
    }, photo?.preview);
  }

  // 사진을 고르거나 찍으면 보낸다. 같은 사진을 다시 골라도 바뀜이 생기게 값을 비운다.
  const onPhotoPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    sendPhoto(event.target.files?.[0]);
    event.target.value = "";
  };

  async function sendPhoto(file: File | undefined) {
    if (!file || pending) return;
    const fresh = photoFreshRef.current;
    photoFreshRef.current = false;
    const thread = threadRef.current;
    // 사진을 고르면 바로 답을 준비하는 중으로 둔다. 줄이는 동안 버튼이 잠기고, 휴대폰 시트도 이때 열려
    // 사진을 읽지 못했다는 안내가 닫힌 시트 뒤에 묻히지 않는다.
    setPending("text");
    const photo = await shrinkPhoto(file);
    if (thread !== threadRef.current) return;
    const question = draft.trim() || photoQuestion || PHOTO_QUESTION;
    setPhotoQuestion(null);
    setDraft("");
    if (fresh) startThread();
    if (!photo) {
      setPending(null);
      setMessages((current) => [
        ...current,
        { from: "user", text: question },
        { from: "bot", text: "사진을 읽지 못했어요. 영수증이나 계기판을 JPG나 PNG 사진으로 다시 골라 주세요." },
      ]);
      return;
    }
    askFree(question, photo, fresh);
  }

  function setFillStatus(id: number, status: AlertStatus) {
    setMessages((current) =>
      current.map((message) =>
        "fill" in message && message.id === id ? { ...message, status, summary: fillSummary(message.fill, status) } : message,
      ),
    );
  }

  // 영수증 기록을 주유 기록에 더한다. 같은 날 기록은 바꾸고, 최근 5번만 남긴다. 두 번 이상이면 다음 주유일을 바로 셈한다.
  function saveFill(id: number, fill: FillProposal, mark: FillMark) {
    const records = [...parseFills(fillStore.read()).filter((record) => record.date !== fill.date), { date: fill.date, liters: fill.liters }]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-MAX_RECORDS);
    // 장부에는 단가·금액·주유소 이름까지 남겨 월간 리포트와 주유소 점검에 쓴다.
    addLedgerEntry({
      date: fill.date,
      liters: fill.litersOnReceipt,
      pricePerLiter: fill.pricePerLiter,
      totalWon: fill.totalWon,
      stationName: fill.stationName,
      ...mark,
    });
    const stored = saveFills(records);
    setFillStatus(id, stored ? "saved" : "unsaved");
    if (!stored) return;
    applyMeasured();
    if (records.length < MIN_RECORDS) {
      setMessages((current) => [
        ...current,
        { from: "bot", text: `주유 기록이 ${records.length}번이에요. 한 번 더 넣으면 다음 주유일을 알려 드려요.` },
      ]);
      return;
    }
    try {
      submitForecast(forecastNextFill(records));
    } catch (problem) {
      const reason = problem instanceof Error ? problem.message : "";
      setMessages((current) => [...current, { from: "bot", text: `기록은 넣었지만 다음 주유일은 셈하지 못했어요. ${reason}` }]);
    }
  }

  function setDashboardStatus(id: number, next: { kmplStatus?: AlertStatus; odometerStatus?: AlertStatus }) {
    setMessages((current) =>
      current.map((message) => {
        if (!("dashboard" in message) || message.id !== id) return message;
        const updated = { ...message, ...next };
        return { ...updated, summary: dashboardSummary(updated.dashboard, updated.kmplStatus, updated.odometerStatus) };
      }),
    );
  }

  // 계기판 평균 연비를 내 연비로 쓴다(이용자가 눌렀을 때만).
  function applyDashboardKmpl(id: number, dashboard: DashboardProposal) {
    if (!dashboard.averageKmpl) return;
    const reading = { kind: "dashboard" as const, kmpl: dashboard.averageKmpl, date: dashboard.date, from: null, km: null, liters: null };
    const stored = saveProfile({ ...profile, reading, kmplSource: "dashboard" });
    setDashboardStatus(id, { kmplStatus: stored ? "saved" : "unsaved" });
  }

  // 계기판 주행거리를 그날 주유 기록에 붙인다.
  function saveOdometer(id: number, dashboard: DashboardProposal, full: boolean) {
    const stored = markFill(dashboard.date, { full, odometerKm: dashboard.odometerKm });
    setDashboardStatus(id, { odometerStatus: stored ? "saved" : "unsaved" });
    if (stored) applyMeasured();
  }

  // 가득→가득 실측 연비가 새로 나오면 내 연비로 쓴다. 직접 넣은 연비는 이용자가 고른 것이라 바꾸지 않고 알려만 준다.
  function applyMeasured() {
    const reading = measuredKmpl(ledgerForServer());
    const known = profile.reading;
    if (!reading) return;
    if (known?.kind === "measured" && known.date === reading.date && known.from === reading.from && known.kmpl === reading.kmpl) return;
    const manual = profile.kmplSource === "manual";
    const stored = saveProfile({ ...profile, reading, kmplSource: manual ? "manual" : "measured" });
    const text = !stored
      ? `${readingBasis(reading)}는 ${reading.kmpl}km/L인데, 이 브라우저에 저장하지 못했어요.`
      : manual
        ? `${readingBasis(reading)}는 ${reading.kmpl}km/L예요. 직접 넣은 연비를 쓰고 있어 바꾸지 않았어요. 내 정보에서 바꿀 수 있어요.`
        : `${readingBasis(reading)}가 ${reading.kmpl}km/L로 나왔어요. 이제 이 연비로 거리 비용과 주행거리를 셈해요.`;
    setMessages((current) => [...current, { from: "bot", text }]);
  }

  // 대시보드에서 누른 기능. 사진 고르기 말고는 바로 새 대화로 시작한다.
  useImperativeHandle(ref, () => ({
    run(command: PanelCommand) {
      if (command.kind === "photo") {
        pickPhotoFor(command.question, true, true);
        return;
      }
      startThread();
      setDraft("");
      if (command.kind === "nearby") askCheapest(place);
      else if (command.kind === "totalCost") askTotalCost();
      else if (command.kind === "ask") askFree(command.question, undefined, true);
      else if (command.kind === "report") askReport(command.month);
      else if (command.kind === "fillForm") askForecast();
      else submitForecast(command.forecast, { save: false });
    },
  }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending) return;
    setDraft("");
    askFree(question);
  }

  // 홈의 시작 질문(큰 카드 4개와 작은 칩). 대화 중 입력창 위에도 같은 질문을 둔다.
  const cards: Starter[] = [
    { label: cheapestQuestion, onClick: () => askCheapest(), Icon: PinIcon },
    { label: EXPLAIN_QUESTION, onClick: () => askFree(EXPLAIN_QUESTION), Icon: ChartIcon },
    { label: `유류세 인하 끝나면 ${amountPhrase(amount)} 얼마 더 들어?`, onClick: askTax, Icon: ReceiptIcon },
    { label: CAP_QUESTION, onClick: askCap, Icon: PumpIcon },
  ];
  const chips: Starter[] = [
    { label: fixedQuestion, onClick: askFixed },
    { label: ALERT_EXAMPLE, onClick: () => askFree(ALERT_EXAMPLE) },
  ];
  const suggestions = [...cards, ...chips];
  const knownFills = mergeLedger(ledger, fills);
  const economy = fuelEconomy(profile);
  // 같은 날 계기판 사진에서 읽은 누적 주행거리(영수증 카드에 채워 준다)
  const odometerOn = (date: string) => {
    for (const message of [...messages].reverse()) {
      if ("dashboard" in message && message.dashboard.date === date && message.dashboard.odometerKm) return message.dashboard.odometerKm;
    }
    return null;
  };
  const today = mounted ? kstClock().today : "";
  // 오늘의 기름 소식은 홈에서만 받는다(오피넷 하루 한도).
  const briefing = useBriefing(fuel, homeArea.code, mounted && !isPanel);
  const headline = mounted ? (newsHeadline(today, fuel, briefing?.data ?? null) ?? greeting(kstClock().hour)) : "안녕하세요";

  return (
    <section
      aria-label={isPanel ? "결과" : "주유 챗봇"}
      data-chat={isPanel ? undefined : ""}
      className={
        isPanel
          ? "flex h-full min-h-0 flex-col"
          : "flex h-[calc(100dvh-3.5rem-6rem)] min-h-[30rem] flex-col lg:h-[calc(100dvh-3.5rem)]"
      }
    >
      <div ref={listRef} aria-live="polite" className={`flex flex-1 flex-col gap-5 overflow-y-auto pb-4 ${isPanel ? "pt-1" : "pt-4"}`}>
        {messages.length === 0 && !busy && isPanel && (
          <div className="my-auto py-6">
            <p className="text-[15px] font-semibold">이 탭에서 궁금한 것 물어보기</p>
            <p className="mt-1 text-sm text-ink-soft">위에서 기능을 누르거나, 아래에 직접 적어 주세요.</p>
            {examples.length > 0 && (
              <div className="mt-4 flex flex-col items-start gap-2">
                {examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => askFree(example)}
                    className="rounded-full px-3.5 py-2 text-left text-sm shadow-raised-sm hover:bg-canvas"
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.length === 0 && !busy && !isPanel && (
          <div className="m-auto w-full max-w-2xl py-4">
            <div className="flex flex-col items-center text-center">
              <span aria-hidden="true" className="flame-orb flame-orb-glow size-16 sm:size-[4.5rem]" />
              <p className="mt-5 text-lg text-ink-soft">
                {loggedIn ? `${profile.name}님, ` : ""}
                {headline}
              </p>
              <h1 className="mt-1 text-[1.75rem] leading-tight font-bold tracking-tight text-balance sm:text-4xl">
                기름값, 무엇이든 물어보세요
              </h1>
            </div>

            {mounted && <FuelNews today={today} fuel={fuel} state={briefing} notice={loggedIn ? nextNotice(profile) : null} />}
            {mounted && !loggedIn && (
              <p className="mt-3 text-center text-sm text-ink-soft">
                지금은 {region.name} 기준이에요. 로그인하면 내 위치와 내 차 기준으로 알려 드려요.{" "}
                <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
                  간편 로그인
                </Link>
              </p>
            )}

            <StarterList cards={cards} chips={chips}>
              <Link href="/alerts" className="rounded-full px-3.5 py-2 text-sm text-ink-soft shadow-raised-sm hover:bg-canvas">
                알림 조건 걸기
              </Link>
            </StarterList>
          </div>
        )}

        {messages.map((message, index) => {
          if (message.from === "user") {
            return (
              <div key={index} className="ml-auto flex w-fit max-w-[85%] animate-rise flex-col items-end gap-2">
                {message.photo && (
                  // eslint-disable-next-line @next/next/no-img-element -- 이 브라우저에서 줄인 사진(data URL)이라 next/image가 필요 없다
                  <img src={message.photo} alt="보낸 사진" className="max-h-48 w-auto rounded-2xl rounded-br-md object-contain shadow-raised-sm" />
                )}
                <p className="rounded-2xl rounded-br-md bg-canvas px-4 py-2.5 text-[15px]">{message.text}</p>
              </div>
            );
          }
          if ("cap" in message) {
            return <CapCard key={index} cap={message.cap} busy={busy} onPastNotice={askFixed} />;
          }
          if ("fillForm" in message) {
            return <FillLogCard key={index} busy={busy} onSubmit={submitForecast} />;
          }
          if ("report" in message) {
            return <ReportCard key={index} report={message.report} onReceipt={() => pickPhotoFor(RECEIPT_QUESTION)} />;
          }
          if ("forecast" in message) {
            return <ForecastCard key={index} forecast={message.forecast} cost={message.forecastCost} />;
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
          if ("dashboard" in message) {
            return (
              <DashboardCard
                key={index}
                dashboard={message.dashboard}
                kmplStatus={message.kmplStatus}
                odometerStatus={message.odometerStatus}
                current={economy}
                hasFill={knownFills.some((entry) => entry.date === message.dashboard.date)}
                busy={busy}
                onUseKmpl={() => applyDashboardKmpl(message.id, message.dashboard)}
                onSaveOdometer={(full) => saveOdometer(message.id, message.dashboard, full)}
              />
            );
          }
          if ("fill" in message) {
            return (
              <FillProposalCard
                key={index}
                fill={message.fill}
                status={message.status}
                odometerHint={odometerOn(message.fill.date)}
                busy={busy}
                onSave={(mark) => saveFill(message.id, message.fill, mark)}
                onDismiss={() => setFillStatus(message.id, "dismissed")}
              />
            );
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
                          <span className="block truncate text-xs text-ink-soft">
                            {station.address || (station.distanceKm !== undefined ? `직선 ${station.distanceKm}km` : "")}
                          </span>
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

      <div className="space-y-3 pt-2 pb-3">
        {!isPanel && (
          <ConditionBar fuel={fuel} place={place} amount={amount} onFuel={setFuel} onPlace={setPlace} onAmount={setAmount} />
        )}

        {!isPanel && (messages.length > 0 || busy) && <SuggestionRow suggestions={suggestions} busy={busy} />}

        <form onSubmit={submit} className="flex items-center gap-1 rounded-full bg-ground p-1.5 shadow-raised">
          <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={onPhotoPicked} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhotoPicked} />
          <button
            type="button"
            onClick={() => pickPhotoFor(null)}
            disabled={busy}
            aria-label="사진 보내기(영수증·계기판)"
            title="영수증이나 계기판 사진으로 주유 기록·연비 남기기"
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-canvas disabled:opacity-50"
          >
            <CameraIcon className="size-5" />
          </button>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            placeholder={
              isPanel
                ? hasMessages
                  ? "이어서 물어보기"
                  : "궁금한 것을 적어 주세요"
                : loggedIn
                  ? "예: 우리 집 근처 경유, 거리까지 따지면?"
                  : "예: 언양 쪽 경유, 거리까지 따지면 어디가 나아?"
            }
            aria-label="질문 입력"
            className="min-w-0 flex-1 rounded-full bg-transparent px-2 py-2.5 text-[15px] placeholder:text-ink-soft focus-visible:outline-offset-1"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label={busy ? "답변을 준비하고 있어요" : "질문 보내기"}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent disabled:cursor-default disabled:bg-canvas disabled:text-ink-soft"
          >
            <SendIcon />
          </button>
        </form>
        {!isPanel && (
          <p className="text-center text-[11px] text-ink-soft">유가 정보: 한국석유공사 오피넷 제공 · 공공데이터 활용 · 팀 유일무이</p>
        )}
      </div>
    </section>
  );
}
