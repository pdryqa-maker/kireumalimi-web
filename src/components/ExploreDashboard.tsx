"use client";

// 탐색 대시보드: 맨 위 조건 줄과 지금 있는 탐색 기능 8개를 상자로 보여 준다. 상자를 누르면 결과 패널에서 그 기능이 실행된다.
// 열 때는 아무것도 조회하지 않는다(오피넷 하루 한도). 누를 때만 조회한다.
import Link from "next/link";
import { useRef, useState } from "react";
import { amountName, type Amount } from "@/lib/fillAmount";
import { fuelName, signedIn } from "@/lib/profile";
import { ledgerStore, parseLedger } from "@/lib/savedLedger";
import ChatPanel, { type PanelCommand, type PanelHandle } from "./ChatPanel";
import { initialPlace, NO_PLACE, placeLabel, usablePlace } from "@/lib/places";
import { ConditionBar } from "./ConditionBar";
import { DashboardPanel, usePanelState } from "./DashboardPanel";
import { CarIcon, DropIcon, HomeIcon, PinIcon, PumpIcon, ReceiptIcon, RouteIcon, ShieldIcon } from "./icons";
import { openLocationPicker } from "./LocationPicker";
import { useMounted, useProfile, useStored } from "./useStored";

type Region = { key: string; area: string; name: string };
type Box = {
  key: string;
  name: string;
  description: string;
  ai: boolean;
  Icon: (props: { className?: string }) => React.ReactNode;
  info: React.ReactNode; // 이 상자가 실제로 쓰는 조건(없으면 null)
  field?: { label: string; value: string; onChange: (value: string) => void; placeholder: string; empty: string };
  action: string;
  command: PanelCommand | null; // null이면 이름 칸이 비어 실행할 수 없다
  pick?: boolean; // 출발 위치나 내 지역이 없어 버튼이 위치 고르기 창을 연다
};

const FIELD =
  "w-full min-w-0 rounded-full bg-transparent px-3.5 py-2 text-[15px] shadow-inset-sm placeholder:text-ink-soft focus-visible:outline-offset-1";

function FeatureBox({ box, locked, onRun }: { box: Box; locked: boolean; onRun: (command: PanelCommand) => void }) {
  const { name, description, ai, Icon, info, field, action, command, pick } = box;
  const fieldId = `box-${box.key}`;
  return (
    <li className="flex flex-col rounded-3xl bg-ground p-5 shadow-raised">
      <div className="flex items-start justify-between gap-3">
        <Icon className="size-6 shrink-0 text-flame" />
        <span className="rounded-full px-2.5 py-1 text-xs font-medium text-ink-soft shadow-inset-sm">
          {ai ? "AI 답변 · 5~12초" : "바로 조회"}
        </span>
      </div>
      <h2 className="mt-3 text-[17px] font-bold tracking-tight">{name}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{description}</p>
      {info && <p className="mt-3 rounded-2xl bg-canvas px-3.5 py-2.5 text-sm">{info}</p>}
      {field && (
        <div className="mt-3">
          <label htmlFor={fieldId} className="text-xs font-medium text-ink-soft">
            {field.label}
          </label>
          <input
            id={fieldId}
            value={field.value}
            onChange={(event) => field.onChange(event.target.value)}
            maxLength={30}
            placeholder={field.placeholder}
            aria-describedby={command ? undefined : `${fieldId}-hint`}
            className={`${FIELD} mt-1`}
          />
          {!command && (
            <p id={`${fieldId}-hint`} className="mt-1.5 text-xs text-ink-soft">
              {field.empty}
            </p>
          )}
        </div>
      )}
      <div className="mt-auto flex justify-end pt-4">
        <button
          type="button"
          disabled={locked || (!command && !pick)}
          onClick={() => (pick ? openLocationPicker() : command && onRun(command))}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent disabled:cursor-default disabled:bg-canvas disabled:text-ink-soft"
        >
          {action}
        </button>
      </div>
    </li>
  );
}

export default function ExploreDashboard({ fixedQuestion, region }: { fixedQuestion: string; region: Region }) {
  const profile = useProfile();
  const mounted = useMounted();
  const ledger = useStored(ledgerStore, parseLedger);
  const [fuelChoice, setFuel] = useState<string | null>(null);
  const [placeChoice, setPlace] = useState<string | null>(null);
  const [amountChoice, setAmount] = useState<Amount | null>(null);
  const fuel = fuelChoice ?? profile.fuel;
  const amount = amountChoice ?? profile.amount;
  const place = usablePlace(placeChoice ?? initialPlace(profile), profile);
  const placeName = placeLabel(place, profile);
  const homeArea = profile.area;
  // 출발 위치(또는 내 지역)가 필요한 상자를 고르기 전에 누르면 위치 고르기 창을 연다.
  const needsPlace = place === NO_PLACE ? { info: "출발 위치를 먼저 골라 주세요", action: "위치 고르기", pick: true } : {};
  const needsArea = !homeArea ? { info: "내 지역을 먼저 골라 주세요", action: "위치 고르기", pick: true } : {};

  // 이름이 필요한 상자는 마지막 영수증 주유소를 미리 넣는다. 이용자가 고치면 그 값을 쓴다.
  const lastStation = (mounted ? ledger.findLast((entry) => entry.stationName)?.stationName : null) ?? "";
  const [trustDraft, setTrustDraft] = useState<string | null>(null);
  const [standingDraft, setStandingDraft] = useState<string | null>(null);
  const [destination, setDestination] = useState("서울");
  const trustName = (trustDraft ?? lastStation).trim();
  const standingName = (standingDraft ?? lastStation).trim();

  const panelRef = useRef<PanelHandle>(null);
  const { open, busy, hasResult, onActivity, openPanel, closePanel } = usePanelState();

  const runBox = (command: PanelCommand) => {
    openPanel();
    panelRef.current?.run(command);
  };

  const fuelText = fuelName(fuel);
  const boxes: Box[] = [
    {
      key: "nearby",
      name: "근처 최저가",
      description: "출발 위치 반경 5km에서 리터당 가격이 낮은 곳",
      ai: false,
      Icon: PinIcon,
      info: `${fuelText} · ${placeName} 반경 5km`,
      action: "보기",
      command: { kind: "nearby" },
      ...needsPlace,
    },
    {
      key: "total-cost",
      name: "거리까지 고려한 추천",
      description: "오가는 기름값까지 더해 실제로 덜 드는 곳",
      ai: false,
      Icon: RouteIcon,
      info: `${fuelText} · ${placeName} 출발 · ${amountName(amount)} · 연비 ${profile.kmpl}km/L`,
      action: "보기",
      command: { kind: "totalCost" },
      ...needsPlace,
    },
    {
      key: "commute",
      name: "출퇴근 길",
      description: "집과 회사 사이에서 덜 드는 곳",
      ai: false,
      Icon: HomeIcon,
      info:
        mounted && profile.home && profile.work ? (
          `${fuelText} · 집 ${profile.home.label} ↔ 회사 ${profile.work.label} · 직선거리`
        ) : (
          <>
            내 정보에서 집과 회사를 저장하면 쓸 수 있어요.{" "}
            <Link href="/login" className="font-semibold underline underline-offset-4">
              내 정보 열기
            </Link>
          </>
        ),
      action: "보기",
      command: mounted && profile.home && profile.work ? { kind: "commute" } : null,
    },
    {
      key: "trust",
      name: "주유소 점검",
      description: "공개 정보와 내 영수증을 맞춰 믿을 만한지 살펴봐요",
      ai: true,
      Icon: ShieldIcon,
      info: null,
      field: {
        label: "주유소 이름",
        value: trustDraft ?? lastStation,
        onChange: setTrustDraft,
        placeholder: "예: ㈜이림 언양주유소",
        empty: "점검할 주유소 이름을 넣어 주세요.",
      },
      action: "점검",
      command: trustName ? { kind: "ask", question: `${trustName} 믿을 만한지 점검해 줘` } : null,
    },
    {
      key: "urea",
      name: "요소수 재고",
      description: "요소수 재고가 있는 주유소와 가격, 보고 시각",
      ai: true,
      Icon: DropIcon,
      info: `${placeName} 근처`,
      action: "찾기",
      command: { kind: "ask", question: `${placeName} 근처 요소수 재고 있는 주유소 알려 줘` },
      ...needsPlace,
    },
    {
      key: "highway",
      name: "고속도로 휴게소",
      description: "가는 길 휴게소 주유소를 순서대로 견줘요",
      ai: true,
      Icon: CarIcon,
      info: `${fuelText} · ${placeName} 출발 · ${amountName(amount)}`,
      field: {
        label: "가는 곳",
        value: destination,
        onChange: setDestination,
        placeholder: "예: 서울",
        empty: "가는 곳을 넣어 주세요.",
      },
      action: "찾기",
      command: destination.trim()
        ? { kind: "ask", question: `${placeName}에서 ${destination.trim()} 가는 길, 휴게소 어디서 넣을까?` }
        : null,
      ...needsPlace,
    },
    {
      key: "standing",
      name: "단골 주유소 싼 편인지",
      description: "동네 평균, 반경 5km 순위와 견줘요",
      ai: true,
      Icon: PumpIcon,
      info: fuelText,
      field: {
        label: "주유소 이름",
        value: standingDraft ?? lastStation,
        onChange: setStandingDraft,
        placeholder: "예: ㈜이림 언양주유소",
        empty: "단골 주유소 이름을 넣어 주세요.",
      },
      action: "확인",
      command: standingName ? { kind: "ask", question: `내 단골 ${standingName}, 아직 동네에서 싼 편이야?` } : null,
    },
    {
      key: "alttle",
      name: "알뜰주유소 진짜 싼지",
      description: "알뜰주유소가 동네 평균보다 정말 싼지 봐요",
      ai: true,
      Icon: ReceiptIcon,
      info: `내 지역(${homeArea?.name}) 기준 · ${fuelText}`,
      action: "확인",
      command: { kind: "ask", question: `${homeArea?.name} 알뜰주유소, 진짜 싼 거 맞아?` },
      ...needsArea,
    },
  ];

  // 로그인했는데 요소수가 필요 없는 차(경유가 아니거나 요소수 필요 없음)면 요소수 상자를 맨 뒤로 보낸다.
  const ureaLast = mounted && signedIn(profile) && !(profile.fuel === "경유" && profile.ureaNeeded);
  const shown = ureaLast ? [...boxes.filter((box) => box.key !== "urea"), ...boxes.filter((box) => box.key === "urea")] : boxes;

  return (
    <div data-wide="" className="grid gap-x-6 pb-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="min-w-0 pt-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">주유소 탐색</h1>
            <p className="mt-1 text-ink-soft">조건을 고르고 필요한 기능을 누르세요. 결과는 패널에 떠요.</p>
          </div>
          <ConditionBar fuel={fuel} place={place} amount={amount} onFuel={setFuel} onPlace={setPlace} onAmount={setAmount} />
        </div>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2">
          {shown.map((box) => (
            <FeatureBox key={box.key} box={box} locked={busy} onRun={runBox} />
          ))}
        </ul>
      </div>
      <DashboardPanel open={open} onOpen={openPanel} onClose={closePanel} label="탐색 결과" hasResult={hasResult}>
        <ChatPanel
          ref={panelRef}
          variant="panel"
          fixedQuestion={fixedQuestion}
          region={region}
          conditions={{ fuel, place, amount }}
          onActivity={onActivity}
          examples={[
            "울산 남구에서 제일 싼 경유 어디야?",
            placeName ? `${placeName}에서 LPG 충전소 거리까지 따지면 어디가 나아?` : "부산 해운대구 알뜰주유소, 진짜 싼 거 맞아?",
          ]}
        />
      </DashboardPanel>
    </div>
  );
}
