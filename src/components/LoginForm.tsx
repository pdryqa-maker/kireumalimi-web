"use client";

// 간편 로그인: 부를 이름, 내 위치, 내 차를 받아 이 브라우저에 저장한다. 비밀번호는 받지 않는다.
// 위치는 두 가지로 받는다. 현재 위치로 찾기(100m 단위로 줄여 저장하고 시군구도 함께 정함) 또는 직접 입력하기(시도·시군구).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AMOUNT_CHOICES, AMOUNT_LIMITS, amountShort, cleanWon, fullNote } from "@/lib/fillAmount";
import {
  CAR_DATA,
  CAR_SIZES,
  DRIVES,
  fuelEconomy,
  isKmpl,
  sizeFullLiters,
  type CarSize,
  type MyCar,
} from "@/lib/fuelEconomy";
import { inKorea, toKatec } from "@/lib/katec";
import { cleanText, fuelName, GUEST, LIMITS, PROFILE_FUELS, profileStore, saveProfile, signedIn, type Profile } from "@/lib/profile";
import { CameraIcon, LocateIcon } from "./icons";
import { shrinkPhoto } from "./photo";
import { useFullLiters } from "./useFill";
import { useMounted, useProfile } from "./useStored";

type Area = { code: string; name: string };

const FIELD =
  "w-full min-w-0 rounded-2xl bg-ground px-4 py-3 text-[15px] shadow-inset-sm placeholder:text-ink-soft focus-visible:outline-offset-1";
const BUTTON = "rounded-full px-4 py-2.5 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm disabled:opacity-50";
const SELECT = `${FIELD} appearance-none pr-10`;
const round100 = (value: number) => Math.round(value / 100) * 100;

// 계기판 사진은 채팅과 같은 AI 답변(/api/chat)으로 읽는다. 한 번 읽을 때마다 AI 답변 한도를 하나 쓴다.
const DASHBOARD_QUESTION = "계기판 사진으로 내 연비 맞춰 줘";
type DashboardRead =
  | { state: "busy" }
  | { state: "found"; kmpl: number; date: string }
  | { state: "applied"; kmpl: number }
  | { state: "note"; text: string };

async function readDashboardKmpl(file: File): Promise<DashboardRead> {
  const photo = await shrinkPhoto(file);
  if (!photo) return { state: "note", text: "사진을 읽지 못했어요. 계기판을 JPG나 PNG 사진으로 다시 골라 주세요." };
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: DASHBOARD_QUESTION }],
        image: { mediaType: photo.mediaType, data: photo.data },
      }),
    });
    const body = await response.json().catch(() => null);
    if (response.status === 429) return { state: "note", text: "지금은 사진을 더 읽을 수 없어요. 잠시 뒤나 내일 다시 찍어 주세요." };
    if (!response.ok) return { state: "note", text: body?.error ?? "사진을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요." };
    const kmpl = body?.dashboard?.averageKmpl;
    const date = body?.dashboard?.date;
    if (typeof kmpl === "number" && isKmpl(kmpl) && typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { state: "found", kmpl, date };
    }
    return { state: "note", text: "평균 연비를 읽지 못했어요. 계기판에 평균 연비(km/L)가 보이게 한 뒤 다시 찍어 주세요." };
  } catch {
    return { state: "note", text: "사진을 보내지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요." };
  }
}

async function loadAreas(sido = ""): Promise<Area[]> {
  const response = await fetch(`/api/areas${sido ? `?sido=${sido}` : ""}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.areas)) throw new Error(body?.error ?? "지역 목록을 불러오지 못했어요.");
  return body.areas;
}

const koreanDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
};
const CHIP = "rounded-full px-4 py-2 text-sm font-semibold";
const chipTone = (on: boolean) => (on ? "bg-accent text-on-accent" : "shadow-raised-sm");
const CAR_SEARCH_FAILED = "차종을 찾지 못했어요. 잠시 뒤 다시 해 보거나 아래에서 차 크기를 골라 주세요.";

// 차종 찾기: 칠 때마다(0.25초 쉬면) 받아 둔 공인 연비 표에서 찾는다.
function CarSearch({ onPick }: { onPick: (car: MyCar) => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; cars: MyCar[]; error: string } | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/cars?${new URLSearchParams({ q })}`).catch(() => null);
      const body = await response?.json().catch(() => null);
      if (!alive) return;
      setResult(
        response?.ok && Array.isArray(body?.cars)
          ? { query: q, cars: body.cars, error: "" }
          : { query: q, cars: [], error: body?.error ?? CAR_SEARCH_FAILED },
      );
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);

  const shown = q && result?.query === q ? result : null;
  return (
    <div className="mt-1.5">
      <input
        type="search"
        enterKeyHint="search"
        maxLength={30}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && event.preventDefault()}
        placeholder="예: 아반떼, 쏘렌토 하이브리드"
        aria-label="차종 찾기"
        className={FIELD}
      />
      {q && !shown && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          찾는 중…
        </p>
      )}
      {shown && shown.cars.length === 0 && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          {shown.error || `'${q}'에 맞는 차종이 없어요. 이름을 줄이거나 아래에서 차 크기를 골라 주세요.`}
        </p>
      )}
      {shown && shown.cars.length > 0 && (
        <>
          <ul aria-label="찾은 차종" className="mt-2 max-h-72 overflow-y-auto rounded-2xl bg-canvas p-1.5">
            {shown.cars.map((car) => (
              <li key={car.id}>
                <button
                  type="button"
                  onClick={() => onPick(car)}
                  className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-ground focus-visible:outline-offset-0"
                >
                  <span className="block text-sm font-medium">{car.name}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {car.maker}, {car.year}년, {fuelName(car.fuel)}
                    {car.hybrid ? " 하이브리드" : ""}, 복합 {car.combined}km/L
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-ink-soft">
            {shown.cars.length}개를 최근 연식부터 보여 줘요. 연식(예: 2021)이나 배기량(예: 1.6)을 덧붙이면 좁혀져요.
          </p>
        </>
      )}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-8 first-of-type:mt-6">
      <legend className="text-base font-semibold">{title}</legend>
      {note && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{note}</p>}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const saved = useProfile();
  const mounted = useMounted();
  const [draft, setDraft] = useState<Profile | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");
  const [sidos, setSidos] = useState<Area[] | null>(null);
  const [sido, setSido] = useState("");
  const [siguns, setSiguns] = useState<Area[]>([]);
  const [areaNote, setAreaNote] = useState("");
  const [picking, setPicking] = useState(false);
  const lookupRef = useRef(0); // 위치·지역 찾기가 늦게 끝나 나중 입력을 덮지 않도록 순번을 센다
  // 계기판 사진: 찍기는 휴대폰 카메라를 바로 열고(capture), 사진 고르기는 앨범에서 고른다.
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const readRef = useRef(0); // 사진을 다시 고르면 앞 사진의 늦은 결과는 버린다
  const [dashboardRead, setDashboardRead] = useState<DashboardRead | null>(null);
  const [error, setError] = useState("");
  // 직접 입력한 금액. 고르는 값에 없는 금액이 저장돼 있으면 처음부터 직접 입력으로 연다.
  const [customWon, setCustomWon] = useState<string | null>(null);

  const form = draft ?? saved;
  const fullTank = useFullLiters(form.fullLiters);
  const custom = customWon !== null || (form.amount !== "full" && !AMOUNT_CHOICES.includes(form.amount));
  const customText = customWon ?? (form.amount !== "full" ? String(form.amount) : "");
  const edit = (next: Partial<Profile>) => {
    setDraft({ ...form, ...next });
    setError("");
  };
  const wasSignedIn = mounted && signedIn(saved);
  const economy = fuelEconomy(form);
  const manual = form.kmplSource === "manual";
  const fromReading = economy.source === "measured" || economy.source === "dashboard";
  const computedSource = form.car ? "car" : form.size ? "size" : "default";
  const readingName = form.reading?.kind === "dashboard" ? "계기판 평균 연비" : "실측 연비";

  // 유종을 바꾸면 다른 유종의 차종은 지우고 크기 평균(없으면 기본값)으로 셈한다.
  function chooseFuel(fuel: string) {
    const keepCar = !form.car || form.car.fuel === fuel;
    edit(keepCar ? { fuel } : { fuel, car: null, kmplSource: form.size ? "size" : "default" });
  }

  // 차종을 고르면 유종도 그 차에 맞추고, 가득일 때의 기본 리터를 그 차 크기에 맞춘다.
  function pickCar(car: MyCar) {
    const size = car.size ?? form.size;
    edit({
      car,
      fuel: car.fuel,
      size,
      hybrid: car.hybrid,
      kmplSource: "car",
      ...(car.size ? { fullLiters: sizeFullLiters(car.size) } : {}),
    });
  }

  function pickSize(size: CarSize) {
    edit({ size, kmplSource: "size", fullLiters: sizeFullLiters(size) });
  }

  async function onDashboardPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const seq = ++readRef.current;
    setDashboardRead({ state: "busy" });
    const result = await readDashboardKmpl(file);
    if (seq === readRef.current) setDashboardRead(result);
  }

  // 읽은 평균 연비를 내 연비로 쓴다. 저장을 눌러야 남는다.
  function applyDashboardKmpl(kmpl: number, date: string) {
    edit({ reading: { kind: "dashboard", kmpl, date, from: null, km: null, liters: null }, kmplSource: "dashboard" });
    setDashboardRead({ state: "applied", kmpl });
  }

  // 현재 위치로 찾기: 휴대폰 위치를 받고, 그 위치가 속한 시군구를 내 지역으로 함께 정한다.
  function locate() {
    setPicking(false);
    if (!("geolocation" in navigator)) {
      setLocationNote("이 브라우저는 위치를 알려 주지 않아요. '직접 입력하기'로 지역을 골라 주세요.");
      return;
    }
    const lookup = ++lookupRef.current;
    setLocating(true);
    setLocationNote("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (!inKorea(coords.latitude, coords.longitude)) {
          setLocating(false);
          setLocationNote("우리나라 밖 위치라 주유소를 찾을 수 없어요. '직접 입력하기'로 지역을 골라 주세요.");
          return;
        }
        const katec = toKatec(coords.latitude, coords.longitude);
        const x = round100(katec.x);
        const y = round100(katec.y);
        // 찾는 동안 바꾼 입력을 덮지 않도록 지금 값에 위치만 더한다.
        setDraft((current) => {
          const base = current ?? saved;
          return { ...base, location: { label: base.location?.label ?? "현재 위치", x, y } };
        });
        const response = await fetch(`/api/areas/locate?x=${x}&y=${y}`).catch(() => null);
        const body = await response?.json().catch(() => null);
        if (lookup !== lookupRef.current) return; // 그사이 직접 고르기를 시작했다
        setLocating(false);
        if (response?.ok && body?.area) {
          setDraft((current) => ({ ...(current ?? saved), area: body.area }));
          setLocationNote("위치를 찾고 내 지역도 정했어요. 위치에 이름을 붙이면 '집 근처'처럼 물을 수 있어요.");
        } else {
          setLocationNote(`위치는 찾았지만 지역은 정하지 못했어요. ${body?.error ?? "'직접 입력하기'로 골라 주세요."}`);
        }
      },
      (problem) => {
        if (lookup !== lookupRef.current) return;
        setLocating(false);
        setLocationNote(
          problem.code === problem.PERMISSION_DENIED
            ? "위치 권한이 꺼져 있어요. 브라우저에서 위치를 허용하거나 '직접 입력하기'로 골라 주세요."
            : "위치를 찾지 못했어요. 잠시 뒤 다시 누르거나 '직접 입력하기'로 골라 주세요.",
        );
      },
      { timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  }

  // 직접 입력하기: 시도·시군구를 고른다. 지금 내 지역이 있으면 그 지역을 골라 둔 채로 연다.
  async function openPicker() {
    lookupRef.current++;
    setLocating(false);
    setLocationNote("");
    setPicking(true);
    setAreaNote("");
    try {
      const list = sidos ?? (await loadAreas());
      setSidos(list);
      const current = form.area?.code.slice(0, 2) ?? "";
      if (current && list.some((area) => area.code === current)) {
        setSido(current);
        setSiguns(await loadAreas(current));
      }
    } catch (problem) {
      setAreaNote(problem instanceof Error ? problem.message : "지역 목록을 불러오지 못했어요.");
    }
  }

  // 직접 고른 지역은 찾아 둔 현재 위치를 대신한다.
  async function chooseSido(code: string) {
    setSido(code);
    setSiguns([]);
    const chosen = sidos?.find((area) => area.code === code);
    if (!chosen) return;
    edit({ area: { code: chosen.code, name: chosen.name }, location: null });
    try {
      setSiguns(await loadAreas(code));
    } catch (problem) {
      setAreaNote(problem instanceof Error ? problem.message : "시군구 목록을 불러오지 못했어요.");
    }
  }

  function chooseSigun(code: string) {
    const parent = sidos?.find((area) => area.code === sido);
    const chosen = siguns.find((area) => area.code === code);
    if (!parent) return;
    edit({
      area: chosen ? { code: chosen.code, name: `${parent.name} ${chosen.name}` } : { code: parent.code, name: parent.name },
      location: null,
    });
  }

  function clearPlace() {
    lookupRef.current++;
    setLocating(false);
    setLocationNote("");
    setPicking(false);
    setSido("");
    setSiguns([]);
    edit({ location: null, area: null });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = cleanText(form.name, LIMITS.name);
    if (!name) {
      setError("부를 이름을 넣어 주세요.");
      return;
    }
    const amount = custom ? cleanWon(Number(customText)) : form.amount;
    if (amount === null) {
      setError(
        `직접 넣는 금액은 ${AMOUNT_LIMITS.minWon.toLocaleString()}~${AMOUNT_LIMITS.maxWon.toLocaleString()}원 사이, 천원 단위로 넣어 주세요.`,
      );
      return;
    }
    if (manual && !isKmpl(form.kmpl)) {
      setError(`연비는 ${LIMITS.minKmpl}~${LIMITS.maxKmpl}km/L 사이로 넣어 주세요.`);
      return;
    }
    if (!saveProfile({ ...form, name, amount })) {
      setError("이 브라우저에 저장하지 못했어요. 개인 정보 보호 모드인지 확인해 주세요.");
      return;
    }
    setDraft(null);
    setCustomWon(null);
    router.push("/");
  }

  function signOut() {
    profileStore.write(GUEST);
    setDraft(null);
    router.push("/");
  }

  return (
    <section aria-labelledby="login-title" className="mx-auto w-full max-w-xl pt-4 pb-10">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="flame-orb size-12 shrink-0" />
        <div>
          <h1 id="login-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            {wasSignedIn ? "내 정보" : "간편 로그인"}
          </h1>
          <p className="mt-1 text-ink-soft">
            {wasSignedIn ? "바꾼 내용은 다음 질문부터 반영돼요." : "내 위치와 내 차를 알려 주면 그 기준으로 답해 드려요."}
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-2" aria-label="내 정보 입력">
        <Section title="부를 이름">
          <input
            required
            maxLength={LIMITS.name}
            autoComplete="nickname"
            value={form.name}
            onChange={(event) => edit({ name: event.target.value })}
            placeholder="예: 재원"
            aria-label="부를 이름"
            className={FIELD}
          />
        </Section>

        <Section title="내 위치" note="근처 주유소, 거리까지 고려한 추천, 내 지역 최저가에 써요. 위치는 100m 단위로 줄여 이 브라우저에만 저장해요.">
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={locate} disabled={locating} className={`${BUTTON} flex items-center justify-center gap-2 bg-accent text-on-accent`}>
              <LocateIcon className="size-4 shrink-0" />
              {locating ? "찾는 중…" : "현재 위치로 찾기"}
            </button>
            <button
              type="button"
              onClick={openPicker}
              aria-expanded={picking}
              className={`${BUTTON} ${picking ? "bg-canvas shadow-inset-sm" : "bg-ground"}`}
            >
              직접 입력하기
            </button>
          </div>
          {locationNote && (
            <p role="status" className="mt-2.5 text-sm text-ink-soft">
              {locationNote}
            </p>
          )}

          {picking && (
            <div className="mt-3">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <select aria-label="시도" value={sido} onChange={(event) => chooseSido(event.target.value)} className={SELECT}>
                  <option value="">시도 고르기</option>
                  {(sidos ?? []).map((area) => (
                    <option key={area.code} value={area.code}>
                      {area.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="시군구"
                  disabled={siguns.length === 0}
                  value={form.area?.code.length === 4 ? form.area.code : ""}
                  onChange={(event) => chooseSigun(event.target.value)}
                  className={SELECT}
                >
                  <option value="">시군구 전체</option>
                  {siguns.map((area) => (
                    <option key={area.code} value={area.code}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                직접 고르면 그 지역 최저가로 안내해요. 근처 주유소와 거리까지 고려한 추천은 현재 위치로 찾아야 쓸 수 있어요.
                {mounted && form.location ? " 고르면 찾아 둔 현재 위치는 지워요." : ""}
              </p>
              {areaNote && (
                <p role="status" className="mt-2 text-sm text-ink-soft">
                  {areaNote}
                </p>
              )}
            </div>
          )}

          {mounted && (form.location || form.area) && (
            <div className="mt-4 rounded-2xl bg-canvas px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm">
                  <span className="font-semibold">내 지역</span>{" "}
                  <span>{form.area ? form.area.name : "정하지 못함"}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {form.location ? "현재 위치로 찾았어요(가장 가까운 주유소의 시군구 기준)." : "직접 골랐어요."}
                  </span>
                </p>
                <button type="button" onClick={clearPlace} className="shrink-0 text-sm text-ink-soft underline underline-offset-4">
                  지우기
                </button>
              </div>
              {form.location && (
                <label className="mt-3 block">
                  <span className="text-sm text-ink-soft">이 위치 이름</span>
                  <input
                    maxLength={LIMITS.label}
                    value={form.location.label}
                    onChange={(event) => edit({ location: { ...form.location!, label: event.target.value } })}
                    onBlur={() => edit({ location: { ...form.location!, label: cleanText(form.location!.label, LIMITS.label) || "현재 위치" } })}
                    placeholder="예: 집, 회사"
                    className={`${FIELD} mt-1.5`}
                  />
                </label>
              )}
            </div>
          )}
        </Section>

        <Section title="내 차" note="유종, 한 번에 넣는 금액, 연비로 금액과 거리 비용을 셈해요.">
          <div role="radiogroup" aria-label="유종" className="flex flex-wrap gap-2">
            {PROFILE_FUELS.map((fuel) => (
              <button
                key={fuel}
                type="button"
                role="radio"
                aria-checked={form.fuel === fuel}
                onClick={() => chooseFuel(fuel)}
                className={`${CHIP} ${chipTone(form.fuel === fuel)}`}
              >
                {fuelName(fuel)}
              </button>
            ))}
          </div>
          <p id="amount-label" className="mt-5 text-sm text-ink-soft">
            한 번에 넣는 금액
          </p>
          <div role="radiogroup" aria-labelledby="amount-label" className="mt-1.5 flex flex-wrap gap-2">
            {AMOUNT_CHOICES.map((choice) => {
              const on = !custom && form.amount === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setCustomWon(null);
                    edit({ amount: choice });
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold tabular-nums ${on ? "bg-accent text-on-accent" : "shadow-raised-sm"}`}
                >
                  {amountShort(choice)}
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={custom}
              onClick={() => {
                setCustomWon(customText);
                setError("");
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${custom ? "bg-accent text-on-accent" : "shadow-raised-sm"}`}
            >
              직접 입력
            </button>
          </div>
          {custom && (
            <label className="mt-3 flex items-center gap-2">
              <span className="sr-only">한 번에 넣는 금액(원)</span>
              <input
                type="number"
                inputMode="numeric"
                min={AMOUNT_LIMITS.minWon}
                max={AMOUNT_LIMITS.maxWon}
                step={AMOUNT_LIMITS.stepWon}
                required
                value={customText}
                onChange={(event) => {
                  setCustomWon(event.target.value);
                  setError("");
                }}
                placeholder="예: 45000"
                className={`${FIELD} max-w-[10rem] tabular-nums`}
              />
              <span className="text-sm text-ink-soft">원</span>
            </label>
          )}
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {!custom && form.amount === "full"
              ? fullNote(fullTank)
              : "금액은 그날 전국 평균 판매가로 몇 리터인지 셈해요."}
          </p>

          <p className="mt-6 text-sm text-ink-soft">차종</p>
          {mounted && form.car ? (
            <div className="mt-1.5 flex items-start justify-between gap-3 rounded-2xl bg-canvas px-4 py-3.5">
              <p className="text-sm">
                <span className="font-semibold">{form.car.name}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  {form.car.maker}, {form.car.year}년, {fuelName(form.car.fuel)}
                  {form.car.hybrid ? " 하이브리드" : ""}, 공인 도심 {form.car.urban}·고속도로 {form.car.highway}km/L
                </span>
              </p>
              <button
                type="button"
                onClick={() => edit({ car: null, kmplSource: form.size ? "size" : "default" })}
                className="shrink-0 text-sm text-ink-soft underline underline-offset-4"
              >
                바꾸기
              </button>
            </div>
          ) : (
            <>
              <CarSearch onPick={pickCar} />
              <p id="size-label" className="mt-4 text-sm text-ink-soft">
                차종을 모르면 차 크기만 골라도 돼요
              </p>
              <div role="radiogroup" aria-labelledby="size-label" className="mt-1.5 flex flex-wrap gap-2">
                {CAR_SIZES.map((size) => {
                  const on = form.kmplSource === "size" && form.size === size.id;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-describedby="size-examples"
                      onClick={() => pickSize(size.id)}
                      className={`${CHIP} ${chipTone(on)}`}
                    >
                      {size.id}
                    </button>
                  );
                })}
              </div>
              <label className="mt-2.5 flex w-fit items-center gap-2 text-sm">
                <input type="checkbox" checked={form.hybrid} onChange={(event) => edit({ hybrid: event.target.checked })} className="size-4 accent-accent" />
                하이브리드 차예요
              </label>
              <p id="size-examples" className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                {CAR_SIZES.find((size) => size.id === form.size)?.examples ?? "예: 경차 모닝·레이, 중형 쏘나타·K5, SUV·RV 투싼·카니발"}
              </p>
            </>
          )}

          {(economy.source === "car" || economy.source === "size") && (
            <>
              <p id="drive-label" className="mt-5 text-sm text-ink-soft">
                주로 다니는 길
              </p>
              <div role="radiogroup" aria-labelledby="drive-label" className="mt-1.5 flex flex-wrap gap-2">
                {DRIVES.map((drive) => (
                  <button
                    key={drive.id}
                    type="button"
                    role="radio"
                    aria-checked={form.drive === drive.id}
                    onClick={() => edit({ drive: drive.id })}
                    className={`${CHIP} ${chipTone(form.drive === drive.id)}`}
                  >
                    {drive.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-5 rounded-2xl bg-canvas px-4 py-3.5">
            {manual ? (
              <label className="flex items-center gap-2">
                <span className="text-sm font-semibold">연비</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={LIMITS.minKmpl}
                  max={LIMITS.maxKmpl}
                  step={0.1}
                  required
                  value={form.kmpl}
                  onChange={(event) => edit({ kmpl: Number(event.target.value) })}
                  aria-label="연비(km/L)"
                  className={`${FIELD} max-w-[7rem] tabular-nums`}
                />
                <span className="text-sm text-ink-soft">km/L</span>
              </label>
            ) : (
              <p className="text-sm">
                <span className="font-semibold">연비</span>{" "}
                <span className="text-lg font-bold tabular-nums">{economy.kmpl}km/L</span>
              </p>
            )}
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              {manual
                ? "직접 넣은 연비로 셈해요."
                : economy.source === "default"
                  ? "지금은 기본값이에요. 차종이나 차 크기를 고르면 내 차에 맞춰 셈해요."
                  : economy.basis}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-soft">
              {form.reading && !fromReading && (
                <button
                  type="button"
                  onClick={() => edit({ kmplSource: form.reading!.kind })}
                  className="underline underline-offset-4"
                >
                  {readingName} {form.reading.kmpl}km/L 쓰기
                </button>
              )}
              {(manual || fromReading) && (
                <button type="button" onClick={() => edit({ kmplSource: computedSource })} className="underline underline-offset-4">
                  차종·크기로 셈하기
                </button>
              )}
              {!manual && (
                <button
                  type="button"
                  onClick={() => edit({ kmplSource: "manual", kmpl: economy.kmpl })}
                  className="underline underline-offset-4"
                >
                  연비 직접 넣기
                </button>
              )}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm font-semibold">더 정확하게 하려면 계기판을 찍어 주세요</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              계기판의 평균 연비를 읽어 내 연비로 쓸 수 있어요. 가득 넣을 때마다 내 기록에 영수증과 누적 주행거리를 남기면 두 번째
              가득부터 실제 연비(달린 거리 ÷ 넣은 양)로 셈해요.
            </p>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onDashboardPhoto} />
            <input ref={albumRef} type="file" accept="image/*" hidden onChange={onDashboardPhoto} />
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={dashboardRead?.state === "busy"}
                className={`${BUTTON} flex items-center gap-1.5`}
              >
                <CameraIcon className="size-4" />
                계기판 찍기
              </button>
              <button
                type="button"
                onClick={() => albumRef.current?.click()}
                disabled={dashboardRead?.state === "busy"}
                className="text-sm text-ink-soft underline underline-offset-4 disabled:opacity-50"
              >
                사진 고르기
              </button>
            </div>
            <div aria-live="polite">
              {dashboardRead?.state === "busy" && <p className="mt-2.5 text-sm text-ink-soft">계기판 사진을 읽고 있어요…</p>}
              {dashboardRead?.state === "note" && <p className="mt-2.5 text-sm">{dashboardRead.text}</p>}
              {dashboardRead?.state === "applied" && (
                <p className="mt-2.5 text-sm">
                  내 연비를 계기판 평균 연비 {dashboardRead.kmpl}km/L로 바꿨어요. 저장하면 이 연비로 셈해요.
                </p>
              )}
              {dashboardRead?.state === "found" && (
                <div className="mt-2.5 rounded-2xl bg-canvas p-4">
                  <p className="text-sm">
                    읽은 평균 연비 <span className="text-lg font-bold tabular-nums">{dashboardRead.kmpl}km/L</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">계기판을 마지막으로 초기화한 뒤의 평균이에요.</p>
                  <button
                    type="button"
                    onClick={() => applyDashboardKmpl(dashboardRead.kmpl, dashboardRead.date)}
                    className={`${BUTTON} mt-3 bg-accent text-on-accent`}
                  >
                    이 연비 쓰기
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            공인 연비는 {CAR_DATA.source}에 {koreanDate(CAR_DATA.registeredOn)}까지 등록된 값이에요. 실제 연비는 운전 습관과 날씨에
            따라 달라요.
          </p>
        </Section>

        {error && (
          <p role="alert" className="mt-6 text-sm font-medium">
            {error}
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded-full bg-accent px-6 py-3 font-semibold text-on-accent shadow-raised-sm">
            {wasSignedIn ? "저장하고 돌아가기" : "이 정보로 시작하기"}
          </button>
          {wasSignedIn && (
            <button type="button" onClick={signOut} className={`${BUTTON} text-ink-soft`}>
              로그아웃
            </button>
          )}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          비밀번호 없이 이 브라우저에만 저장해요. 질문할 때 부를 이름, 위치 이름, 내 차 정보를 AI에 함께 보내고, 위치 좌표는
          주유소 조회에만 써요. 로그아웃하면 내 정보를 지워요(알림 조건과 주유 기록은 남아요).
        </p>
      </form>
    </section>
  );
}
