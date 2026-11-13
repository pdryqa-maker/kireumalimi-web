// 간편 로그인으로 받은 내 정보. 비밀번호 없이 이 브라우저에만 저장한다(실제 서비스는 카카오 로그인으로 제안).
// 서버는 질문을 받을 때 이 값을 다시 검사해서 쓴다. 정확한 좌표는 AI에 보내지 않고 조회에만 쓴다.
import { browserStore } from "./browserStore";
import { cleanAmount, DEFAULT_AMOUNT, DEFAULT_FULL_LITERS, isLiters, type Amount } from "./fillAmount";
import {
  cleanCar,
  cleanReading,
  DEFAULT_DRIVE,
  DEFAULT_KMPL,
  fuelEconomy,
  isCarSize,
  isDrive,
  isKmpl,
  isKmplSource,
  type CarSize,
  type Drive,
  type KmplReading,
  type KmplSource,
  type MyCar,
} from "./fuelEconomy";

export type MyPlace = { label: string; x: number; y: number }; // x·y는 오피넷 KATEC 좌표
export type MyArea = { code: string; name: string }; // 오피넷 지역코드(시도 2자리, 시군구 4자리)
export type Profile = {
  name: string; // 부를 이름. 비어 있으면 로그인 전이다
  fuel: string;
  amount: Amount; // 한 번에 넣는 양: 금액(원) 또는 가득
  fullLiters: number; // 가득일 때 기본 리터. 영수증이 2번 이상 쌓이면 영수증 값을 쓴다
  car: MyCar | null; // 고른 차종(공인 연비)
  size: CarSize | null; // 차종을 모를 때 고른 차 크기
  hybrid: boolean; // 크기 평균을 하이브리드 차로 셈할지
  drive: Drive; // 주로 다니는 길
  reading: KmplReading | null; // 계기판 평균 연비나 가득→가득 실측 연비
  kmplSource: KmplSource; // 연비를 어디서 얻었는지
  kmpl: number; // 계산에 쓰는 연비. 차종·크기로 정하면 저장할 때마다 다시 셈한다
  location: MyPlace | null;
  area: MyArea | null;
};

export const PROFILE_FUELS = ["휘발유", "경유", "자동차부탄"];
export const fuelName = (fuel: string) => (fuel === "자동차부탄" ? "LPG" : fuel);
export const GUEST: Profile = {
  name: "",
  fuel: "휘발유",
  amount: DEFAULT_AMOUNT,
  fullLiters: DEFAULT_FULL_LITERS,
  car: null,
  size: null,
  hybrid: false,
  drive: DEFAULT_DRIVE,
  reading: null,
  kmplSource: "default",
  kmpl: DEFAULT_KMPL,
  location: null,
  area: null,
};
export const LIMITS = { name: 12, label: 12, areaName: 30, minKmpl: 3, maxKmpl: 30 }; // 연비 범위는 fuelEconomy.ts와 같다

// 우리나라를 넉넉히 감싸는 KATEC 범위(제주 남단 ~ 독도). 이 밖이면 오피넷에 물을 수 없다.
export const KATEC_BOUNDS = { minX: 50_000, maxX: 760_000, minY: 0, maxY: 700_000 };

export function isKatec(x: unknown, y: unknown): x is number {
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= KATEC_BOUNDS.minX &&
    x <= KATEC_BOUNDS.maxX &&
    y >= KATEC_BOUNDS.minY &&
    y <= KATEC_BOUNDS.maxY
  );
}

// 이름과 장소 이름은 AI 지시문에도 들어가므로 글자, 숫자, 띄어쓰기, 몇 가지 부호만 남긴다.
export function cleanText(value: unknown, max: number) {
  return typeof value === "string"
    ? value
        .replace(/[^\p{L}\p{N} ·()\-]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
}

export function cleanPlace(value: unknown): MyPlace | null {
  const place = value as Partial<MyPlace> | null;
  const label = cleanText(place?.label, LIMITS.label);
  if (!label || !isKatec(place?.x, place?.y)) return null;
  return { label, x: Math.round(place!.x as number), y: Math.round(place!.y as number) };
}

function cleanArea(value: unknown): MyArea | null {
  const area = value as Partial<MyArea> | null;
  const name = cleanText(area?.name, LIMITS.areaName);
  return typeof area?.code === "string" && /^\d{2}(\d{2})?$/.test(area.code) && name ? { code: area.code, name } : null;
}

// 예전에는 한 번에 넣는 양을 리터(liters)로 받았다. 그 값은 가득일 때의 리터로 옮겨 계산 결과가 바뀌지 않게 한다.
// 연비 근거(kmplSource)가 없던 예전 프로필은 12가 아니면 직접 넣은 연비로 본다.
export function cleanProfile(value: unknown): Profile {
  const item = (value ?? {}) as Partial<Profile> & { liters?: unknown };
  const legacyLiters = Number(item.liters);
  const fullLiters = Number(item.fullLiters);
  const kmpl = Number(item.kmpl);
  const fuel = PROFILE_FUELS.includes(item.fuel as string) ? (item.fuel as string) : GUEST.fuel;
  const car = cleanCar(item.car, PROFILE_FUELS);
  const size = isCarSize(item.size) ? item.size : (car?.size ?? null);
  const hybrid = item.hybrid === true;
  const drive = isDrive(item.drive) ? item.drive : DEFAULT_DRIVE;
  const reading = cleanReading(item.reading);
  const kmplSource = isKmplSource(item.kmplSource) ? item.kmplSource : isKmpl(kmpl) && kmpl !== DEFAULT_KMPL ? "manual" : "default";
  const economy = fuelEconomy({ fuel, car, size, hybrid, drive, kmplSource, kmpl, reading });
  return {
    name: cleanText(item.name, LIMITS.name),
    fuel,
    amount: cleanAmount(item.amount) ?? (isLiters(legacyLiters) ? "full" : GUEST.amount),
    fullLiters: isLiters(fullLiters) ? fullLiters : isLiters(legacyLiters) ? legacyLiters : GUEST.fullLiters,
    car: car?.fuel === fuel ? car : null, // 유종을 바꾸면 그 유종이 아닌 차종은 지운다
    size,
    hybrid,
    drive,
    reading,
    kmplSource: economy.source,
    kmpl: economy.kmpl,
    location: cleanPlace(item.location),
    area: cleanArea(item.area),
  };
}

export const profileStore = browserStore("kireumalimi.profile", "{}");

export function parseProfile(raw: string) {
  try {
    return cleanProfile(JSON.parse(raw));
  } catch {
    return GUEST;
  }
}

export const saveProfile = (profile: Profile) => profileStore.write(cleanProfile(profile));
export const signedIn = (profile: Profile) => profile.name !== "";
