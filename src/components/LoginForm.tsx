"use client";

// 로그인과 내 정보(/login). 내 정보 칸은 부를 이름, 내 위치, 자주 가는 곳, 내 차, 주유 할인·뺀 상표.
// - 게스트: [로그인 | 가입하기] 탭. 로그인 탭은 아이디·비밀번호만 받는다. 가입 탭은 아이디·비밀번호와 내 정보 칸을 한 번에 받는다.
//   로그인 탭 아래 '로그인 없이 이 브라우저에만 내 정보 저장하기'를 누르면 내 정보 칸을 펴서 계정 없이도 쓸 수 있다.
// - 로그인한 사람: 내 정보 칸에서 언제든 고친다. 저장하면 accountSync가 계정에도 올린다.
// - 계정 기능이 꺼진 배포(unavailable)나 계정 상태를 못 받을 때: 내 정보 칸만 보이고 이 브라우저에만 저장한다.
// 위치는 두 가지로 받는다. 현재 위치로 찾기(100m 단위로 줄여 저장하고 시군구도 함께 정함) 또는 직접 입력하기(시도·시군구).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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
import { BRAND_KEYS, DISCOUNT_LIMITS, type BrandKey, type Discount } from "@/lib/discounts";
import { inKorea, toKatec } from "@/lib/katec";
import { placeAt, placeGroups } from "@/lib/places";
import {
  cleanText,
  fuelName,
  LIMITS,
  PROFILE_FUELS,
  saveProfile,
  signedIn,
  type MyPlace,
  type Profile,
} from "@/lib/profile";
import { clearBrowserProfile, signIn } from "@/lib/accountSync";
import {
  AccountActions,
  AccountTabs,
  checkCredentials,
  cleanId,
  LoginBox,
  NO_CREDENTIALS,
  panelId,
  SignupFields,
  tabId,
  type AccountTab,
  type Credentials,
} from "./AccountPanel";
import { loadAreas, type Area } from "./areaApi";
import { CameraIcon, LocateIcon } from "./icons";
import { shrinkPhoto } from "./photo";
import { useFullLiters } from "./useFill";
import { useAccount } from "./useAccount";
import { useMounted, useProfile } from "./useStored";

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

const MONTHLY_KM_ERROR = `한 달 주행거리는 ${LIMITS.minMonthlyKm.toLocaleString("ko-KR")}~${LIMITS.maxMonthlyKm.toLocaleString("ko-KR")}km로 넣어 주세요.`;
const DISCOUNT_ERROR = `할인은 리터당 ${DISCOUNT_LIMITS.minWon}~${DISCOUNT_LIMITS.maxWon}원 사이 정수로 넣어 주세요.`;
type DiscountRow = { brand: BrandKey; won: string };

// 할인 줄 → 저장할 할인. 금액을 비운 줄은 버린다. 틀린 줄이 있으면 오류 문구.
function readDiscounts(rows: DiscountRow[]): { discounts: Discount[] } | { error: string } {
  const discounts = rows
    .filter((row) => row.won.trim() !== "")
    .map((row) => ({ brand: row.brand, wonPerLiter: Number(row.won) }));
  const bad = discounts.some(
    ({ wonPerLiter }) => !Number.isInteger(wonPerLiter) || wonPerLiter < DISCOUNT_LIMITS.minWon || wonPerLiter > DISCOUNT_LIMITS.maxWon,
  );
  if (bad) return { error: DISCOUNT_ERROR };
  if (new Set(discounts.map((discount) => discount.brand)).size !== discounts.length) return { error: "같은 상표 할인은 하나만 넣어 주세요." };
  return { discounts };
}

// 자주 가는 곳 한 줄(집 또는 회사): 지금 여기로 저장(100m 단위) 또는 내 지역 출발 위치 목록에서 고르기.
function PlaceRow({
  title,
  place,
  area,
  mounted,
  onChange,
}: {
  title: "집" | "회사";
  place: MyPlace | null;
  area: Area | null;
  mounted: boolean;
  onChange: (place: MyPlace | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const groups = placeGroups(area);

  function here() {
    setPicking(false);
    if (!("geolocation" in navigator)) {
      setNote("이 브라우저는 위치를 알려 주지 않아요. '목록에서 고르기'로 골라 주세요.");
      return;
    }
    setLocating(true);
    setNote("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        if (!inKorea(coords.latitude, coords.longitude)) {
          setNote("우리나라 밖 위치라 저장하지 않았어요. '목록에서 고르기'로 골라 주세요.");
          return;
        }
        const katec = toKatec(coords.latitude, coords.longitude);
        onChange({ label: "현재 위치", x: round100(katec.x), y: round100(katec.y) });
      },
      (problem) => {
        setLocating(false);
        setNote(
          problem.code === problem.PERMISSION_DENIED
            ? "위치 권한이 꺼져 있어요. 브라우저에서 위치를 허용하거나 '목록에서 고르기'로 골라 주세요."
            : "위치를 찾지 못했어요. 잠시 뒤 다시 누르거나 '목록에서 고르기'로 골라 주세요.",
        );
      },
      { timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  }

  function pick(key: string) {
    const found = placeAt(key);
    if (!found) return;
    onChange({ label: found.name.slice(0, LIMITS.label), x: found.x, y: found.y });
    setPicking(false);
    setNote("");
  }

  return (
    <div className="rounded-2xl bg-canvas px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">
          <span className="font-semibold">{title}</span> <span>{mounted && place ? place.label : "없음"}</span>
        </p>
        {mounted && place && (
          <button type="button" onClick={() => onChange(null)} className="shrink-0 text-sm text-ink-soft underline underline-offset-4">
            지우기
          </button>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={here} disabled={locating} className={`${BUTTON} flex items-center gap-1.5`}>
          <LocateIcon className="size-4 shrink-0" />
          {locating ? "찾는 중…" : "지금 여기로 저장"}
        </button>
        <button
          type="button"
          onClick={() => setPicking(!picking)}
          aria-expanded={picking}
          className={`${BUTTON} ${picking ? "bg-ground shadow-inset-sm" : ""}`}
        >
          목록에서 고르기
        </button>
      </div>
      {picking && groups.length === 0 && (
        <p className="mt-2.5 text-sm text-ink-soft">내 지역을 먼저 고르면 그 지역의 시군구청·읍면 목록에서 고를 수 있어요.</p>
      )}
      {picking && groups.length > 0 && (
        <select aria-label={`${title} 고르기`} value="" onChange={(event) => pick(event.target.value)} className={`${SELECT} mt-2.5`}>
          <option value="">{title === "집" ? "집과 가까운 곳 고르기" : "회사와 가까운 곳 고르기"}</option>
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.places.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {note && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          {note}
        </p>
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

// 계정 상태를 이만큼 기다려도 못 받으면(연결 끊김, 계정 저장소 고장) 내 정보만 이 브라우저에 저장해 쓰게 한다.
const ACCOUNT_WAIT_MS = 4_000;

function useWaitedTooLong(waiting: boolean) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setLate(true), ACCOUNT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);
  return waiting && late;
}

// account: 로그인한 사람이 고치기. browser: 계정 없이 이 브라우저에만 저장. signup: 아이디·비밀번호와 함께 가입.
type FormMode = "account" | "browser" | "signup";

// 로그인하거나 계정이 바뀌면 입력 중이던 값을 버리고 계정 값으로 다시 그린다(게스트 때 입력하던 값이 계정 값을 덮지 않게).
export default function LoginForm() {
  const account = useAccount();
  const late = useWaitedTooLong(account.status === "unknown");
  const guest = account.status === "guest";
  return (
    <section aria-labelledby="login-title" className="mx-auto w-full max-w-xl pt-4 pb-10">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="flame-orb size-12 shrink-0" />
        <div>
          <h1 id="login-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            {guest ? "로그인" : "내 정보"}
          </h1>
          <p className="mt-1 text-ink-soft">
            {account.status === "account"
              ? `${account.id} 계정으로 로그인했어요. 아래 내 정보는 언제든 고칠 수 있고, 저장하면 어느 기기에서나 바뀐 정보가 보여요.`
              : guest
                ? "로그인하면 다른 기기에서도 내 정보와 주유 기록이 그대로 보여요."
                : "내 위치와 내 차를 알려 주면 그 기준으로 답해 드려요."}
          </p>
        </div>
      </div>
      {account.status === "account" ? (
        <ProfileForm key={`account:${account.id}`} mode="account" />
      ) : guest ? (
        <GuestForms />
      ) : account.status === "unavailable" || late ? (
        <>
          <p className="mt-6 rounded-2xl bg-canvas px-4 py-3 text-sm text-ink-soft">
            {account.status === "unavailable" ? "로그인 준비 중이에요." : "계정에 연결하지 못했어요. 지금은 내 정보를 이 브라우저에만 저장해요."}
          </p>
          <ProfileForm key="browser" mode="browser" />
        </>
      ) : (
        <div aria-hidden="true" className="mt-6 min-h-[19.5rem]" />
      )}
    </section>
  );
}

// 게스트: [로그인 | 가입하기]. 두 탭을 모두 그려 두고 고른 탭만 보인다(탭을 오가도 치던 값이 남게).
function GuestForms() {
  const base = useId();
  const [tab, setTab] = useState<AccountTab>("login");
  const [browserOnly, setBrowserOnly] = useState(false);
  const saved = useProfile();
  const mounted = useMounted();
  const hasBrowserProfile = mounted && signedIn(saved);
  return (
    <>
      <AccountTabs base={base} tab={tab} onChoose={setTab} />
      <div id={panelId(base, "login")} role="tabpanel" aria-labelledby={tabId(base, "login")} hidden={tab !== "login"}>
        <LoginBox />
        <div className="mt-10 border-t border-hairline pt-6">
          <button
            type="button"
            aria-expanded={browserOnly}
            onClick={() => setBrowserOnly((open) => !open)}
            className="text-sm text-ink-soft underline underline-offset-4"
          >
            {hasBrowserProfile ? "이 브라우저에 저장한 내 정보 고치기" : "로그인 없이 이 브라우저에만 내 정보 저장하기"}
          </button>
          {browserOnly && <ProfileForm key="browser" mode="browser" />}
        </div>
      </div>
      <div id={panelId(base, "signup")} role="tabpanel" aria-labelledby={tabId(base, "signup")} hidden={tab !== "signup"}>
        <ProfileForm key="signup" mode="signup" />
      </div>
    </>
  );
}

function ProfileForm({ mode }: { mode: FormMode }) {
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
  // 한 달 주행거리와 할인 줄은 고치는 동안 글자로 두고, 저장할 때 숫자로 바꾼다.
  const [monthlyText, setMonthlyText] = useState<string | null>(null);
  const [discountRows, setDiscountRows] = useState<DiscountRow[] | null>(null);
  // 가입 탭의 아이디·비밀번호와 가입을 보내는 중인지
  const [credentials, setCredentials] = useState<Credentials>(NO_CREDENTIALS);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";
  const uid = useId(); // 가입 칸과 이 브라우저 칸이 한 화면에 함께 있을 수 있어 칸 이름표 id를 양식마다 따로 둔다

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
  const monthlyShown = monthlyText ?? (form.monthlyKm !== null ? String(form.monthlyKm) : "");
  const rows = discountRows ?? form.discounts.map((discount) => ({ brand: discount.brand, won: String(discount.wonPerLiter) }));
  const editRows = (next: DiscountRow[]) => {
    setDiscountRows(next);
    setError("");
  };
  const bothBrands = rows.filter((row) => row.won.trim() !== "" && form.excludeBrands.includes(row.brand)).map((row) => row.brand);
  // 위치 찾기처럼 늦게 끝날 수 있으니 지금 값에 그 곳만 바꾼다.
  const setPlace = (key: "home" | "work") => (place: MyPlace | null) => {
    setDraft((current) => ({ ...(current ?? saved), [key]: place }));
    setError("");
  };
  function toggleBrand(brand: BrandKey) {
    const on = form.excludeBrands.includes(brand);
    edit({ excludeBrands: BRAND_KEYS.filter((key) => (key === brand ? !on : form.excludeBrands.includes(key))) });
  }

  // 유종을 바꾸면 다른 유종의 차종은 지우고 크기 평균(없으면 기본값)으로 셈한다.
  function chooseFuel(fuel: string) {
    const keepCar = !form.car || form.car.fuel === fuel;
    const ureaNeeded = fuel === "경유" && form.ureaNeeded; // 요소수는 경유차만
    edit(keepCar ? { fuel, ureaNeeded } : { fuel, ureaNeeded, car: null, kmplSource: form.size ? "size" : "default" });
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

  // 입력한 내 정보를 저장할 값으로 바꾼다. 틀린 칸이 있으면 오류 문구.
  function readProfile(): { profile: Profile } | { error: string } {
    const name = cleanText(form.name, LIMITS.name);
    if (!name) return { error: "부를 이름을 넣어 주세요." };
    const amount = custom ? cleanWon(Number(customText)) : form.amount;
    if (amount === null) {
      return {
        error: `직접 넣는 금액은 ${AMOUNT_LIMITS.minWon.toLocaleString()}~${AMOUNT_LIMITS.maxWon.toLocaleString()}원 사이, 천원 단위로 넣어 주세요.`,
      };
    }
    if (manual && !isKmpl(form.kmpl)) return { error: `연비는 ${LIMITS.minKmpl}~${LIMITS.maxKmpl}km/L 사이로 넣어 주세요.` };
    const monthlyValue = monthlyShown.trim() === "" ? null : Number(monthlyShown);
    if (monthlyValue !== null && !(monthlyValue >= LIMITS.minMonthlyKm && monthlyValue <= LIMITS.maxMonthlyKm)) {
      return { error: MONTHLY_KM_ERROR };
    }
    const read = readDiscounts(rows);
    if ("error" in read) return { error: read.error };
    const monthlyKm = monthlyValue === null ? null : Math.round(monthlyValue);
    return { profile: { ...form, name, amount, monthlyKm, discounts: read.discounts } };
  }

  // 가입: 아이디·비밀번호와 내 정보를 먼저 다 보고, 가입이 된 뒤에 내 정보를 저장한다.
  // 가입하면 동기화가 이 브라우저의 기록을 새 계정에 합치고, 그 뒤 저장한 내 정보는 바뀐 칸으로 계정에 올라간다.
  // (먼저 저장하면 로그인 기간이 끝난 옛 계정의 사본이 남은 브라우저에서는 합치기 전에 지워진다.)
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = signup ? checkCredentials(credentials) : null;
    if (problem) return setError(problem);
    const read = readProfile();
    if ("error" in read) return setError(read.error);
    if (signup) {
      setBusy(true);
      setError("");
      const result = await signIn("signup", cleanId(credentials.id), credentials.password);
      setBusy(false);
      if (!result.ok) return setError(result.error);
    }
    if (!saveProfile(read.profile)) {
      setError("이 브라우저에 저장하지 못했어요. 개인 정보 보호 모드인지 확인해 주세요.");
      return;
    }
    setDraft(null);
    setCustomWon(null);
    setMonthlyText(null);
    setDiscountRows(null);
    router.push("/");
  }

  function signOut() {
    clearBrowserProfile();
    setDraft(null);
    router.push("/");
  }

  return (
    <form onSubmit={submit} className="mt-2" aria-label={signup ? "가입하기" : "내 정보 입력"} noValidate={signup}>
      {signup && (
        <>
          <SignupFields
            value={credentials}
            onChange={(next) => {
              setCredentials(next);
              setError("");
            }}
          />
          <div className="mt-10 border-t border-hairline pt-6">
            <h2 className="text-lg font-semibold">내 정보</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              부를 이름만 꼭 넣어 주세요. 나머지는 비워 두고 나중에 내 정보에서 언제든 고칠 수 있어요.
            </p>
          </div>
        </>
      )}
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

      <Section title="내 위치" note="근처 주유소, 거리까지 고려한 추천, 내 지역 최저가에 써요. 위치는 100m 단위로 줄여 저장해요.">
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

      <Section title="자주 가는 곳" note="출퇴근 길 추천과 요소수 찾기에 써요. 위치는 100m 단위로 줄여 저장해요.">
        <div className="grid gap-2.5">
          <PlaceRow title="집" place={form.home} area={form.area} mounted={mounted} onChange={setPlace("home")} />
          <PlaceRow title="회사" place={form.work} area={form.area} mounted={mounted} onChange={setPlace("work")} />
        </div>
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
        {form.fuel === "경유" && (
          <label className="mt-3 flex w-fit items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ureaNeeded}
              onChange={(event) => edit({ ureaNeeded: event.target.checked })}
              className="size-4 accent-accent"
            />
            요소수가 필요한 차예요
          </label>
        )}
        <p id={`${uid}-amount-label`} className="mt-5 text-sm text-ink-soft">
          한 번에 넣는 금액
        </p>
        <div role="radiogroup" aria-labelledby={`${uid}-amount-label`} className="mt-1.5 flex flex-wrap gap-2">
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

        <label className="mt-5 block">
          <span className="text-sm text-ink-soft">한 달 주행거리</span>
          <span className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              step="any"
              value={monthlyShown}
              onChange={(event) => {
                setMonthlyText(event.target.value);
                setError("");
              }}
              placeholder="예: 1200"
              className={`${FIELD} max-w-[8rem] tabular-nums`}
            />
            <span className="text-sm text-ink-soft">km</span>
          </span>
          <span className="mt-1.5 block text-xs leading-relaxed text-ink-soft">
            주유 기록이 2번보다 적을 때 이 거리로 다음 주유일을 셈해요. 모르면 비워 두세요.
          </span>
        </label>

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
            <p id={`${uid}-size-label`} className="mt-4 text-sm text-ink-soft">
              차종을 모르면 차 크기만 골라도 돼요
            </p>
            <div role="radiogroup" aria-labelledby={`${uid}-size-label`} className="mt-1.5 flex flex-wrap gap-2">
              {CAR_SIZES.map((size) => {
                const on = form.kmplSource === "size" && form.size === size.id;
                return (
                  <button
                    key={size.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-describedby={`${uid}-size-examples`}
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
            <p id={`${uid}-size-examples`} className="mt-1.5 text-xs leading-relaxed text-ink-soft">
              {CAR_SIZES.find((size) => size.id === form.size)?.examples ?? "예: 경차 모닝·레이, 중형 쏘나타·K5, SUV·RV 투싼·카니발"}
            </p>
          </>
        )}

        {(economy.source === "car" || economy.source === "size") && (
          <>
            <p id={`${uid}-drive-label`} className="mt-5 text-sm text-ink-soft">
              주로 다니는 길
            </p>
            <div role="radiogroup" aria-labelledby={`${uid}-drive-label`} className="mt-1.5 flex flex-wrap gap-2">
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

      <Section title="주유 할인·상표" note="넣은 할인은 추천 순위와 예상 비용에 반영돼요. 화면에는 오피넷 가격과 할인액을 함께 보여 줘요.">
        <p className="text-sm text-ink-soft">할인 카드·멤버십(최대 {DISCOUNT_LIMITS.max}개)</p>
        <div className="mt-1.5 grid gap-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                aria-label={`할인 ${index + 1} 상표`}
                value={row.brand}
                onChange={(event) => editRows(rows.map((item, at) => (at === index ? { ...item, brand: event.target.value as BrandKey } : item)))}
                className={`${SELECT} max-w-[11rem]`}
              >
                {BRAND_KEYS.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
              <span className="shrink-0 text-sm text-ink-soft">리터당</span>
              <input
                type="number"
                inputMode="numeric"
                step="any"
                value={row.won}
                onChange={(event) => editRows(rows.map((item, at) => (at === index ? { ...item, won: event.target.value } : item)))}
                placeholder="100"
                aria-label={`할인 ${index + 1} 리터당 원`}
                className={`${FIELD} max-w-[6rem] tabular-nums`}
              />
              <span className="shrink-0 text-sm text-ink-soft">원</span>
              <button
                type="button"
                onClick={() => editRows(rows.filter((_, at) => at !== index))}
                className="ml-auto shrink-0 text-sm text-ink-soft underline underline-offset-4"
              >
                빼기
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={rows.length >= DISCOUNT_LIMITS.max}
          onClick={() => editRows([...rows, { brand: BRAND_KEYS.find((brand) => !rows.some((row) => row.brand === brand)) ?? BRAND_KEYS[0], won: "" }])}
          className={`${BUTTON} mt-2.5`}
        >
          할인 더하기
        </button>

        <p id={`${uid}-exclude-label`} className="mt-6 text-sm text-ink-soft">
          빼고 싶은 상표
        </p>
        <div role="group" aria-labelledby={`${uid}-exclude-label`} className="mt-1.5 flex flex-wrap gap-2">
          {BRAND_KEYS.map((brand) => {
            const on = form.excludeBrands.includes(brand);
            return (
              <button key={brand} type="button" aria-pressed={on} onClick={() => toggleBrand(brand)} className={`${CHIP} ${chipTone(on)}`}>
                {brand}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          {form.excludeBrands.length === BRAND_KEYS.length
            ? "상표를 모두 빼면 추천할 주유소가 없어요."
            : bothBrands.length > 0
              ? `뺀 상표(${bothBrands.join(", ")})는 할인이 있어도 추천에 넣지 않아요.`
              : "고른 상표는 근처 최저가와 추천에서 빼요. 알뜰주유소는 자영·농협·고속도로 알뜰을 모두 뜻해요."}
        </p>
      </Section>

      {error && (
        <p role="alert" className="mt-6 text-sm font-medium">
          {error}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-accent px-6 py-3 font-semibold text-on-accent shadow-raised-sm disabled:opacity-50"
        >
          {signup ? (busy ? "가입하는 중…" : "가입하고 시작하기") : wasSignedIn ? "저장하고 돌아가기" : "이 정보로 시작하기"}
        </button>
        {mode === "browser" && wasSignedIn && (
          <button type="button" onClick={signOut} className={`${BUTTON} text-ink-soft`}>
            이 브라우저의 내 정보 지우기
          </button>
        )}
        {mode === "account" && <AccountActions />}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        {mode === "account"
          ? "이 브라우저와 계정에 저장해요. 로그아웃하면 이 브라우저에서 내 정보와 기록을 지우고, 계정에는 남아요."
          : signup
            ? "가입하면 내 정보와 이 브라우저에 있던 주유 기록·알림 조건을 계정에 저장해요. 어느 기기에서 로그인해도 같은 정보가 보여요."
            : "로그인하지 않으면 이 브라우저에만 저장해요. 이 브라우저의 내 정보 지우기를 누르면 내 정보를 지워요(알림 조건과 주유 기록은 남아요)."}{" "}
        질문할 때 부를 이름, 위치 이름, 내 차 정보, 할인·뺀 상표를 AI에 함께 보내고, 위치 좌표(내 위치·집·회사)는 주유소 조회에만 써요.{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          개인정보 처리방침
        </Link>
      </p>
    </form>
  );
}
