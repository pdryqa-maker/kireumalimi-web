// 차종 검색. 한국에너지공단 자동차 표시연비(공공데이터포털)를 scripts/build-car-efficiency.mjs로 받아 둔 표를 쓴다.
// 표가 커서(약 2,600종) 서버에서만 읽고, 화면에는 찾은 차종 몇 개만 보낸다.
import table from "@/data/carEfficiency.json";
import { isCarSize, type MyCar } from "./fuelEconomy";

type Row = [string, string, string, string, number, number, number, number, number, string | null];

const toCar = ([id, maker, name, fuel, hybrid, year, urban, highway, combined, size]: Row): MyCar => ({
  id,
  name,
  maker,
  fuel,
  hybrid: hybrid === 1,
  year,
  urban,
  highway,
  combined,
  size: isCarSize(size) ? size : null,
});

const squash = (text: string) => text.replace(/\s+/g, "").toUpperCase();
const CARS = (table.cars as Row[]).map((row) => ({ car: toCar(row), text: squash(`${row[1]}${row[2]}`), name: squash(row[2]) }));

export const CAR_QUERY_MAX = 30;
export const CAR_RESULTS = 20;

// 띄어 쓴 낱말이 모두 이름(제조사 포함)에 들어 있는 차종. 네 자리 숫자는 연식으로도 맞춰 본다.
// 이름이 검색어로 시작하는 차종을 먼저, 그다음 최근 연식 순으로 돌려준다.
export function searchCars(query: string, fuel?: string | null, limit = CAR_RESULTS): MyCar[] {
  const words = query.trim().slice(0, CAR_QUERY_MAX).split(/\s+/).map(squash).filter(Boolean);
  if (words.length === 0) return [];
  const found = CARS.filter(
    (item) =>
      (!fuel || item.car.fuel === fuel) &&
      words.every((word) => item.text.includes(word) || (/^\d{4}$/.test(word) && item.car.year === Number(word))),
  );
  const leads = (item: (typeof CARS)[number]) => (item.name.startsWith(words[0]) ? 0 : 1);
  return found
    .sort((a, b) => leads(a) - leads(b) || b.car.year - a.car.year || a.car.name.localeCompare(b.car.name, "ko"))
    .slice(0, limit)
    .map((item) => item.car);
}

export const carById = (id: string) => CARS.find((item) => item.car.id === id)?.car ?? null;
