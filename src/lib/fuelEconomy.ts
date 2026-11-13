// 연비를 내 차에 맞춘다. 정확한 것부터: 계기판 평균 연비·가득→가득 실측 연비 > 차종 공인 연비 > 차 크기 평균 > 12km/L.
// 공인 연비는 주로 다니는 길(시내·반반·고속도로)에 맞춰 섞는다. 직접 넣은 연비는 이용자가 고른 것이라 그대로 쓴다.
// 브라우저와 서버가 함께 쓴다.
// 차종 표 전체(src/data/carEfficiency.json)는 서버의 carEfficiency.ts만 읽고, 여기서는 작은 크기 평균 표만 읽는다.
import sizeTable from "@/data/carSizes.json";
import type { LedgerEntry } from "./ledger";

export const DEFAULT_KMPL = 12;
const KMPL_RANGE = { min: 3, max: 30 };
const round1 = (value: number) => Math.round(value * 10) / 10;
const num = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
const clampKmpl = (value: number) => Math.min(Math.max(round1(value), KMPL_RANGE.min), KMPL_RANGE.max);
export const isKmpl = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= KMPL_RANGE.min && value <= KMPL_RANGE.max;

// 시내 비율. 공인 복합 연비는 도심 55%·고속도로 45%로 섞은 값이라 '반반'을 그 비율로 둔다.
export const DRIVES = [
  { id: "city", label: "시내 위주", city: 0.8 },
  { id: "mixed", label: "반반", city: 0.55 },
  { id: "highway", label: "고속도로 위주", city: 0.2 },
] as const;
export type Drive = (typeof DRIVES)[number]["id"];
export const DEFAULT_DRIVE: Drive = "mixed";
export const isDrive = (value: unknown): value is Drive => DRIVES.some((drive) => drive.id === value);
const driveOf = (id: Drive) => DRIVES.find((drive) => drive.id === id) ?? DRIVES[1]; // 모르는 값이면 반반

// 가득일 때의 기본 리터는 크기마다 흔한 연료탱크(대략 45~80L)를 다 비우지 않고 넣는 양으로 잡았다.
export const CAR_SIZES = [
  { id: "경차", fullLiters: 30, examples: "모닝·레이·캐스퍼" },
  { id: "소형·준중형", fullLiters: 40, examples: "아반떼·K3" },
  { id: "중형", fullLiters: 45, examples: "쏘나타·K5" },
  { id: "대형", fullLiters: 55, examples: "그랜저·K8·G80" },
  { id: "SUV·RV", fullLiters: 50, examples: "투싼·쏘렌토·카니발" },
] as const;
export type CarSize = (typeof CAR_SIZES)[number]["id"];
export const isCarSize = (value: unknown): value is CarSize => CAR_SIZES.some((size) => size.id === value);
export const sizeFullLiters = (size: CarSize) => CAR_SIZES.find((item) => item.id === size)!.fullLiters;

// 고른 차종. 표를 다시 만들면 id가 바뀔 수 있어 이름과 연비를 함께 저장한다.
export type MyCar = {
  id: string;
  name: string;
  maker: string;
  fuel: string; // 오피넷 유종 이름(휘발유·경유·자동차부탄)
  hybrid: boolean;
  year: number;
  urban: number; // 공인 도심 연비(km/L)
  highway: number; // 공인 고속도로 연비(km/L)
  combined: number; // 공인 복합 연비(km/L)
  size: CarSize | null;
};

// 연비를 어디서 얻었는지. measured(가득→가득 실측), dashboard(계기판 평균 연비), car(차종 공인 연비),
// size(크기 평균), manual(직접 입력), default(기본 12)
const SOURCES = ["measured", "dashboard", "car", "size", "manual", "default"] as const;
export type KmplSource = (typeof SOURCES)[number];
export const isKmplSource = (value: unknown): value is KmplSource => SOURCES.includes(value as KmplSource);

// 계기판이나 장부로 얻은 연비. 사진 날짜(dashboard)나 마지막 가득 날짜(measured)와 셈한 근거를 함께 둔다.
export type KmplReading = {
  kind: "measured" | "dashboard";
  kmpl: number;
  date: string; // YYYY-MM-DD
  from: string | null; // measured: 첫 가득 날짜
  km: number | null; // measured: 달린 거리
  liters: number | null; // measured: 그동안 넣은 양
};

// 가득→가득 실측: 가득 넣고 누적 주행거리를 남긴 두 주유 사이에 달린 거리 ÷ 그 뒤로 넣은 양(두 번째 가득까지).
// 사이 주유의 양을 하나라도 모르거나, 거리가 50km 미만·3,000km 초과면 그 구간은 쓰지 않는다. 최근 이어진 구간 3개까지 합친다.
const MEASURE = { minKm: 50, maxKm: 3000, spans: 3 };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const monthDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
const round2 = (value: number) => Math.round(value * 100) / 100;

export function cleanReading(value: unknown): KmplReading | null {
  const item = value as Partial<KmplReading> | null;
  if (!item || (item.kind !== "measured" && item.kind !== "dashboard")) return null;
  if (!isKmpl(item.kmpl) || typeof item.date !== "string" || !DATE.test(item.date)) return null;
  if (item.kind === "dashboard") return { kind: "dashboard", kmpl: round1(item.kmpl), date: item.date, from: null, km: null, liters: null };
  const km = num(item.km, 1, MEASURE.maxKm * MEASURE.spans);
  const liters = num(item.liters, 0.1, 1000);
  if (typeof item.from !== "string" || !DATE.test(item.from) || !km || !liters) return null;
  return { kind: "measured", kmpl: round1(item.kmpl), date: item.date, from: item.from, km: Math.round(km), liters: round2(liters) };
}

export const readingBasis = (reading: KmplReading) =>
  reading.kind === "dashboard"
    ? `계기판 평균 연비(${monthDay(reading.date)} 사진)`
    : `가득→가득 실측 연비(${monthDay(reading.from!)}~${monthDay(reading.date)}, ${reading.km!.toLocaleString("ko-KR")}km ÷ ${reading.liters}L)`;


// 가득→가득 실측 연비. 쓸 구간이 없으면 null.
export function measuredKmpl(ledger: LedgerEntry[]): KmplReading | null {
  const entries = [...ledger].sort((a, b) => a.date.localeCompare(b.date));
  const anchors = entries.flatMap((entry, index) => (entry.full && entry.odometerKm !== null ? [{ entry, index }] : []));
  const spans: { from: string; to: string; km: number; liters: number }[] = [];
  for (let k = 1; k < anchors.length; k++) {
    const [start, end] = [anchors[k - 1], anchors[k]];
    const km = end.entry.odometerKm! - start.entry.odometerKm!;
    const between = entries.slice(start.index + 1, end.index + 1);
    if (between.some((entry) => entry.liters === null)) continue;
    const liters = between.reduce((total, entry) => total + entry.liters!, 0);
    if (km < MEASURE.minKm || km > MEASURE.maxKm || !(liters > 0) || !isKmpl(km / liters)) continue;
    spans.push({ from: start.entry.date, to: end.entry.date, km, liters });
  }
  // 끝에서부터 서로 이어진 구간만 모은다.
  const recent: typeof spans = [];
  for (const span of [...spans].reverse()) {
    if (recent.length === MEASURE.spans || (recent.length > 0 && span.to !== recent[0].from)) break;
    recent.unshift(span);
  }
  if (recent.length === 0) return null;
  const km = recent.reduce((total, span) => total + span.km, 0);
  const liters = round2(recent.reduce((total, span) => total + span.liters, 0));
  const kmpl = round1(km / liters);
  if (!isKmpl(kmpl)) return null;
  return { kind: "measured", kmpl, date: recent.at(-1)!.to, from: recent[0].from, km, liters };
}

// 도심·고속도로 연비를 주행 비율로 섞는다. 같은 거리를 달릴 때 드는 연료를 더하므로 조화평균이다.
export function mixKmpl(urban: number, highway: number, drive: Drive) {
  const city = driveOf(drive).city;
  return clampKmpl(1 / (city / urban + (1 - city) / highway));
}

type Group = { urban: number; highway: number; combined: number; models: string[] };
const SIZE_GROUPS = sizeTable.sizes as Record<CarSize, Record<string, Group>>;
export const CAR_DATA = { source: sizeTable.source, registeredOn: sizeTable.registeredOn };

const groupName = (key: string) => key.replace("자동차부탄", "LPG").replace("+", " ");

// 크기 평균. 같은 크기·유종·하이브리드 묶음이 없으면 하이브리드를 빼고, 그래도 없으면 같은 크기 휘발유 차로 셈한다.
export function sizeEfficiency(size: CarSize, fuel: string, hybrid: boolean) {
  const groups = SIZE_GROUPS[size];
  const keys = [hybrid ? `${fuel}+하이브리드` : "", fuel, "휘발유"].filter(Boolean);
  const key = keys.find((name) => groups?.[name]);
  return key ? { ...groups[key], name: `${size} ${groupName(key)} 차` } : null;
}

export type FuelEconomy = {
  kmpl: number;
  source: KmplSource;
  basis: string; // 화면과 AI에 그대로 쓰는 근거 한 줄
};

type EconomyInput = {
  fuel: string;
  car: MyCar | null;
  size: CarSize | null;
  hybrid: boolean;
  drive: Drive;
  kmplSource: KmplSource;
  kmpl: number;
  reading: KmplReading | null;
};

// 저장된 선택으로 지금 쓸 연비를 정한다. 고른 근거가 쓸 수 없으면(유종이 다른 차종 등) 다음 근거로 내려간다.
export function fuelEconomy({ fuel, car, size, hybrid, drive, kmplSource, kmpl, reading }: EconomyInput): FuelEconomy {
  const how = driveOf(drive).label;
  if ((kmplSource === "measured" || kmplSource === "dashboard") && reading?.kind === kmplSource) {
    return { kmpl: reading.kmpl, source: kmplSource, basis: readingBasis(reading) };
  }
  if (kmplSource === "manual" && isKmpl(kmpl)) {
    return { kmpl: round1(kmpl), source: "manual", basis: "직접 넣은 연비" };
  }
  // 계기판·실측 값을 쓸 수 없으면 차종, 그다음 크기 평균으로 내려간다.
  const auto = kmplSource !== "manual" && kmplSource !== "default";
  if (auto && kmplSource !== "size" && car && car.fuel === fuel) {
    return {
      kmpl: mixKmpl(car.urban, car.highway, drive),
      source: "car",
      basis: `${car.name}(${car.year}) 공인 연비(도심 ${car.urban}·고속도로 ${car.highway}km/L)를 '${how}' 기준으로 섞은 값`,
    };
  }
  const group = auto && size ? sizeEfficiency(size, fuel, hybrid) : null;
  if (group) {
    return {
      kmpl: mixKmpl(group.urban, group.highway, drive),
      source: "size",
      basis: `${group.name} 평균 공인 연비(도심 ${group.urban}·고속도로 ${group.highway}km/L)를 '${how}' 기준으로 섞은 값`,
    };
  }
  return { kmpl: DEFAULT_KMPL, source: "default", basis: `기본값 ${DEFAULT_KMPL}km/L(차종·차 크기를 모름)` };
}

const CAR_NAME = 60;

// 차 이름에는 "1.6", "18\"/19\"", "S&S" 같은 부호가 들어가 프로필 이름보다 넓게 받는다.
const cleanCarText = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .replace(/[^\p{L}\p{N} ().\-/_+&[\]~,"'·]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

export function cleanCar(value: unknown, fuels: string[]): MyCar | null {
  const car = value as Partial<MyCar> | null;
  if (!car || typeof car !== "object") return null;
  const id = typeof car.id === "string" && /^c[0-9a-z]{1,6}$/.test(car.id) ? car.id : null;
  const name = cleanCarText(car.name, CAR_NAME);
  const maker = cleanCarText(car.maker, 20);
  const urban = num(car.urban, 2, 40);
  const highway = num(car.highway, 2, 40);
  const combined = num(car.combined, 2, 40);
  const year = num(car.year, 2000, 2100);
  if (!id || !name || !urban || !highway || !combined || !year || !fuels.includes(car.fuel as string)) return null;
  return {
    id,
    name,
    maker,
    fuel: car.fuel as string,
    hybrid: car.hybrid === true,
    year: Math.round(year),
    urban: round1(urban),
    highway: round1(highway),
    combined: round1(combined),
    size: isCarSize(car.size) ? car.size : null,
  };
}
