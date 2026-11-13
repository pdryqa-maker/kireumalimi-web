// 한국에너지공단 자동차 표시연비(공공데이터포털 B553530/CAREFF/CAREFF_LIST)로 차종 연비 표를 만든다.
// 표는 코드에 넣어 두고 쓰므로 배포에는 인증키가 필요 없다. 새 차종이 나오면 이 스크립트를 다시 돌린다.
//
// 사용:
//   node scripts/build-car-efficiency.mjs              # .env.local의 CAREFF_API_KEY로 전체 목록을 받아 만든다
//   node scripts/build-car-efficiency.mjs --from a.json # 이미 받아 둔 목록(JSON 배열)으로 만든다
//
// 만드는 파일
//   src/data/carEfficiency.json: 차종별 도심·고속도로·복합 연비(서버의 차종 검색이 쓴다)
//   src/data/carSizes.json: 차 크기·유종·하이브리드별 가운데값(차종을 모를 때 쓴다, 화면에서도 쓴다)
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url);
const OUT_CARS = new URL("src/data/carEfficiency.json", ROOT);
const OUT_SIZES = new URL("src/data/carSizes.json", ROOT);

// 오피넷 유종 이름으로 바꾼다. 전기·수소·플러그인 하이브리드는 오피넷 유종이 아니라 뺀다.
const FUELS = { 휘발유: "휘발유", 경유: "경유", LPG: "자동차부탄" };
const TYPES = new Set(["내연기관", "하이브리드"]);

// 차 크기 묶음(국산 차 이름 앞부분). 차종을 모르는 이용자를 위한 평균을 낼 때만 쓴다. 우리가 정한 묶음이다.
const DOMESTIC = ["현대", "기아", "케이지모빌리티", "한국지엠", "르노코리아"];
const SIZES = {
  경차: ["모닝", "레이", "스파크", "캐스퍼"],
  "소형·준중형": ["아반떼", "K3", "엑센트", "벨로스터", "i30", "아이오닉", "쏘울"],
  중형: ["쏘나타", "K5", "말리부", "SM6"],
  대형: ["그랜저", "K7", "K8", "K9", "G70", "G80", "G90", "스팅어", "아슬란"],
  "SUV·RV": [
    "투싼", "스포티지", "싼타페", "쏘렌토", "팰리세이드", "모하비", "코나", "셀토스", "니로", "베뉴", "스토닉",
    "트랙스", "트레일블레이저", "QM6", "XM3", "ARKANA", "콜레오스", "코란도", "티볼리", "렉스턴", "토레스", "액티언",
    "GV70", "GV80", "카니발",
  ],
};

async function download() {
  const env = readFileSync(new URL(".env.local", ROOT), "utf8");
  const key = /^CAREFF_API_KEY=(\S+)/m.exec(env)?.[1];
  if (!key) throw new Error(".env.local에 CAREFF_API_KEY가 없습니다.");
  const rows = [];
  for (let page = 1; page <= 100; page++) {
    const url = `https://apis.data.go.kr/B553530/CAREFF/CAREFF_LIST?serviceKey=${key}&pageNo=${page}&numOfRows=100`;
    const text = await (await fetch(url)).text();
    const code = /<resultCode>([^<]*)<\/resultCode>/.exec(text)?.[1];
    if (code && code !== "00") throw new Error(`표시연비 API 오류(resultCode ${code}, ${page}쪽)`);
    const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, block]) =>
      Object.fromEntries([...block.matchAll(/<([A-Z_0-9]+)>([\s\S]*?)<\/\1>/g)].map(([, k, v]) => [k, v.trim()])),
    );
    rows.push(...items);
    if (items.length < 100) break;
  }
  return rows;
}

const from = process.argv.indexOf("--from");
const raw = from > 0 ? JSON.parse(readFileSync(process.argv[from + 1], "utf8")) : await download();

const squash = (text) => text.replace(/\s+/g, "").toUpperCase();
const sizeOf = (maker, name) => {
  if (!DOMESTIC.includes(maker)) return null;
  const head = squash(name);
  return Object.entries(SIZES).find(([, names]) => names.some((family) => head.startsWith(squash(family))))?.[0] ?? null;
};
// "(22MY)", "_24MY"처럼 연식 표시만 다른 같은 차는 하나로 묶는다.
const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" };
const cleanName = (name) =>
  name
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity])
    .replace(/[_\s]?\(?\d{2}MY\)?/g, "")
    .replace(/[“”″]|''/g, '"')
    .replace(/\s+/g, " ")
    .trim();
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const byKey = new Map();
let registeredOn = "";
for (const row of raw) {
  const fuel = FUELS[row.FUEL_NM];
  if (!fuel || !TYPES.has(row.CAR_TYPE)) continue;
  const urban = num(row.URBAN_EFF);
  const highway = num(row.HIGHWAY_EFF);
  const combined = num(row.DISPLAY_EFF);
  if (!urban || !highway || !combined) continue;
  const name = cleanName(row.MODEL_NM);
  const hybrid = row.CAR_TYPE === "하이브리드";
  const year = Number(row.YEAR) || 0;
  const maker = row.COMP_NM.replace(/\(주\)|주식회사|자동차/g, "").trim();
  const key = [maker, name, fuel, hybrid].join("|");
  const previous = byKey.get(key);
  if (!previous || year > previous.year) {
    byKey.set(key, { maker, name, fuel, hybrid, year, urban, highway, combined, size: sizeOf(maker, name) });
  }
  if ((row.DATA_REG_DT ?? "") > registeredOn) registeredOn = row.DATA_REG_DT;
}

const cars = [...byKey.values()].sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, "ko"));
// id는 표 안에서만 쓰는 짧은 값이다. 표를 다시 만들면 바뀔 수 있어, 프로필에는 id와 함께 이름과 연비도 저장한다.
const table = cars.map((car, index) => [
  `c${index.toString(36)}`,
  car.maker,
  car.name,
  car.fuel,
  car.hybrid ? 1 : 0,
  car.year,
  car.urban,
  car.highway,
  car.combined,
  car.size,
]);

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 10) / 10;
};
// 한 차종(예: G90)의 세부 모델이 수십 개라 그대로 가운데값을 내면 그 차종에 끌려간다.
// 그래서 차종(이름 묶음)별 가운데값을 먼저 내고, 그 값들의 가운데값을 쓴다.
const familyOf = (car) => SIZES[car.size].find((family) => squash(car.name).startsWith(squash(family)));
const sizes = {};
for (const size of Object.keys(SIZES)) {
  sizes[size] = {};
  for (const fuel of Object.values(FUELS)) {
    for (const hybrid of [false, true]) {
      const families = new Map();
      for (const car of cars) {
        if (car.size !== size || car.fuel !== fuel || car.hybrid !== hybrid) continue;
        const family = familyOf(car);
        families.set(family, [...(families.get(family) ?? []), car]);
      }
      if (families.size < 2) continue; // 차종이 둘보다 적으면 크기 평균으로 쓰지 않는다
      const pick = (field) => median([...families.values()].map((group) => median(group.map((car) => car[field]))));
      sizes[size][`${fuel}${hybrid ? "+하이브리드" : ""}`] = {
        urban: pick("urban"),
        highway: pick("highway"),
        combined: pick("combined"),
        models: [...families.keys()],
      };
    }
  }
}

const meta = {
  source: "한국에너지공단 자동차 표시연비(공공데이터포털)",
  registeredOn: registeredOn.slice(0, 10),
  builtOn: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10), // 한국 날짜
};
writeFileSync(OUT_CARS, JSON.stringify({ ...meta, columns: ["id", "maker", "name", "fuel", "hybrid", "year", "urban", "highway", "combined", "size"], cars: table }));
writeFileSync(OUT_SIZES, `${JSON.stringify({ ...meta, families: SIZES, sizes }, null, 2)}\n`);
console.log(`차종 ${table.length}개(원본 ${raw.length}행), 크기 묶음 ${cars.filter((car) => car.size).length}개`);
for (const [size, groups] of Object.entries(sizes)) {
  console.log(size, Object.entries(groups).map(([k, v]) => `${k} ${v.urban}/${v.highway}/${v.combined}(${v.models.join("·")})`).join(", "));
}
