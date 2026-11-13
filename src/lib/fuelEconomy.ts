// 연비를 내 차에 맞춘다. 차종을 고르면 그 차의 공인 도심·고속도로 연비를, 차종을 모르면 차 크기 평균을 쓰고,
// 주로 다니는 길(시내·반반·고속도로)에 맞춰 섞는다. 브라우저와 서버가 함께 쓴다.
// 차종 표 전체(src/data/carEfficiency.json)는 서버의 carEfficiency.ts만 읽고, 여기서는 작은 크기 평균 표만 읽는다.
import sizeTable from "@/data/carSizes.json";

export const DEFAULT_KMPL = 12;
const KMPL_RANGE = { min: 3, max: 30 };
const round1 = (value: number) => Math.round(value * 10) / 10;
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

// 연비를 어디서 얻었는지. car(차종 공인 연비), size(크기 평균), manual(직접 입력), default(기본 12)
export type KmplSource = "car" | "size" | "manual" | "default";
export const isKmplSource = (value: unknown): value is KmplSource =>
  value === "car" || value === "size" || value === "manual" || value === "default";

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
};

// 저장된 선택으로 지금 쓸 연비를 정한다. 고른 근거가 쓸 수 없으면(유종이 다른 차종 등) 다음 근거로 내려간다.
export function fuelEconomy({ fuel, car, size, hybrid, drive, kmplSource, kmpl }: EconomyInput): FuelEconomy {
  const how = driveOf(drive).label;
  if (kmplSource === "manual" && isKmpl(kmpl)) {
    return { kmpl: round1(kmpl), source: "manual", basis: "직접 넣은 연비" };
  }
  if (kmplSource === "car" && car && car.fuel === fuel) {
    return {
      kmpl: mixKmpl(car.urban, car.highway, drive),
      source: "car",
      basis: `${car.name}(${car.year}) 공인 연비(도심 ${car.urban}·고속도로 ${car.highway}km/L)를 '${how}' 기준으로 섞은 값`,
    };
  }
  const group = (kmplSource === "car" || kmplSource === "size") && size ? sizeEfficiency(size, fuel, hybrid) : null;
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
const num = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;

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
