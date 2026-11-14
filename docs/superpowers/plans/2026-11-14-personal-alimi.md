# 개인화된 기름 알리미 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내 정보에서 할인·주행거리·집과 회사·뺀 상표·요소수를 더 받고, 그 값과 주유 장부를 한 곳에서 셈해 내 기록 요약, 알림 문구, 추천 순위에 함께 쓴다.

**Architecture:** 상표·할인 규칙은 `src/lib/discounts.ts`, 개인 계산은 `src/lib/personal.ts`(둘 다 브라우저·서버 공용 순수 모듈)에 둔다. 서버의 `stations.ts`는 선호(`Prefs`)를 받아 거르고 할인 가격으로 순위를 매긴다. 브라우저는 `usePersonal` 훅 하나로 요약과 알림이 같은 숫자를 쓴다.

**Tech Stack:** Next.js 16(App Router, Turbopack), React 19 + React Compiler lint, Tailwind 4, TypeScript strict. 테스트는 node 스크립트(`$S/apptest/runNN.mjs`, `node:assert/strict`, 가짜 fetch).

**Spec:** `docs/superpowers/specs/2026-11-14-personal-alimi-design.md`

```
S=/private/tmp/claude-501/-Users-jaewon-Desktop--26-UNIST-------------AI----------/64e9718b-33b2-40d5-b4ca-fe421dd15bbf/scratchpad
W3=$S/won3
t() { APP_ROOT=$W3 node --import $S/apptest/register.mjs $S/apptest/$1.mjs; }   # 예: t run13
```

## Global Constraints

- 숫자는 오피넷이나 이용자가 남긴 기록에서만 나온다. 요약과 알림은 AI를 부르지 않는다.
- 화면은 무엇을 기준으로 셈했는지 밝힌다. 할인 반영 가격 옆에는 늘 할인 전 오피넷 가격과 할인액을 함께 보인다.
- 오피넷 키는 하루 300번 한도다. 요약은 페이지를 열 때 오피넷을 최대 1번(평균가) 부르고 그 결과를 하루 동안 브라우저(`kireumalimi.areaPrice`)에 남긴다. 나머지 조회는 버튼을 눌렀을 때만 한다.
- '나머지 달도 셈하기'는 한 번 누를 때 2달까지만 셈한다.
- 금액을 리터로 바꾸는 값은 어디서나 전국 평균가(/api/fill, `useFill`)다. 가득의 예상 금액만 내 지역 평균가(/api/briefing local)로 셈한다.
- 가격 알림(○원 이하)은 오피넷 가격 그대로 잰다. 할인·뺀 상표는 근처 최저가, 거리까지 고려한 추천, 지역 최저가, 출퇴근 길, 단골 점검의 '더 싼 곳'에만 쓴다.
- 채팅은 로그인했을 때만 profile을 보낸다(지금과 같다).
- 문구는 해요체, 쉬운 말. 셀프 주유소 거르기는 만들지 않는다. 예시 기록 버튼도 만들지 않는다.
- 저장은 이 브라우저에만 한다. 예전 프로필은 새 필드를 기본값으로 읽는다.
- `npx tsc --noEmit`과 `npx eslint src`를 통과해야 한다. 새 클론이면 먼저 `npx next typegen`.
- 커밋: `git -c user.name="배재원" -c user.email="273242562+jaewonbbae@users.noreply.github.com" commit`, 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **근처 5km 안 주유소가 모두 뺀 상표:** 목록이 비고 "뺀 상표를 빼니 남은 곳이 없어요(○곳 뺌)"로 안내해야 한다. 0으로 나누거나 `stations[0]`을 읽다 깨지면 안 된다. → Task 3 테스트.
2. **같은 상표를 할인에도 넣고 빼기에도 넣음:** 빼기가 이긴다. 그 상표는 결과에 없고, 할인 계산은 다른 상표에 영향이 없다. → Task 3 테스트.
3. **오피넷 평균가를 못 받음(장애·한도):** 요약의 다른 줄은 그대로 보이고, 가득 예상 금액만 빠진다. → Task 2 테스트(`fillCost`의 `areaPrice: null`).
4. **해가 바뀌는 달:** 1월의 '지난달'은 전년 12월이고, 12월 말 예보의 남은 주유 횟수는 12월 안에서만 센다. → Task 2 테스트.
5. **같은 주유소의 다른 표기:** '㈜이림 언양주유소'와 '(주)이림 언양주유소'는 단골 셈에서 한 곳이다. → Task 2 테스트(`favoriteStation`).

---

### Task 1: 상표·할인 규칙과 profile 새 필드

**Files:**
- Create: `src/lib/discounts.ts`
- Modify: `src/lib/profile.ts` (Profile 타입, GUEST, cleanProfile)
- Test: `$S/apptest/run13.mjs`

**Interfaces:**
- Produces:
  - `BRAND_KEYS = ["SK에너지","GS칼텍스","HD현대오일뱅크","S-OIL","알뜰주유소","E1","SK가스"] as const`, `type BrandKey`
  - `type Discount = { brand: BrandKey; wonPerLiter: number }`, `type Prefs = { discounts: Discount[]; excludeBrands: BrandKey[] }`, `NO_PREFS: Prefs`
  - `DISCOUNT_LIMITS = { max: 3, minWon: 1, maxWon: 500 }`
  - `brandKey(brand: string): BrandKey | null` — 이름에 '알뜰'이 있으면 "알뜰주유소", BRAND_KEYS에 있으면 그대로, 아니면 null
  - `cleanDiscounts(value: unknown): Discount[]` — 틀린 항목은 버리고, 같은 상표는 앞의 것만, 최대 3개
  - `cleanBrands(value: unknown): BrandKey[]` — 중복 없이
  - `discountFor(brand: string, discounts: Discount[]): number` (0이면 할인 없음)
  - `effectivePrice(price: number, brand: string, discounts: Discount[]): number` — 0 밑으로 내려가지 않음
  - `isExcluded(brand: string, excludeBrands: BrandKey[]): boolean`
  - `bestDiscount(discounts: Discount[]): Discount | null` — wonPerLiter가 가장 큰 것
  - `prefsQuery(prefs: Prefs): Record<string, string>` — 비었으면 `{}`, 아니면 `discounts=S-OIL:100,GS칼텍스:50`, `exclude=SK에너지,E1`
  - `prefsFrom(params: URLSearchParams): Prefs` — 없으면 NO_PREFS, 형식·범위가 틀리면 `RangeError`
  - Profile에 `monthlyKm: number | null; discounts: Discount[]; excludeBrands: BrandKey[]; ureaNeeded: boolean; home: MyPlace | null; work: MyPlace | null`
  - `prefsOf(profile: Profile): Prefs` (profile.ts)

- [ ] **Step 1: 실패하는 테스트 run13.mjs 쓰기**

```js
const d = await import(root + "/src/lib/discounts.ts");
const pr = await import(root + "/src/lib/profile.ts");
assert.equal(d.brandKey("자영알뜰"), "알뜰주유소");
assert.equal(d.brandKey("농협알뜰"), "알뜰주유소");
assert.equal(d.brandKey("S-OIL"), "S-OIL");
assert.equal(d.brandKey("자가상표"), null);
assert.deepEqual(
  d.cleanDiscounts([{ brand: "S-OIL", wonPerLiter: 100 }, { brand: "S-OIL", wonPerLiter: 50 }, { brand: "GS칼텍스", wonPerLiter: 0 },
    { brand: "모름", wonPerLiter: 10 }, { brand: "E1", wonPerLiter: 600 }, { brand: "SK에너지", wonPerLiter: 30 },
    { brand: "E1", wonPerLiter: 20 }, { brand: "SK가스", wonPerLiter: 10 }]),
  [{ brand: "S-OIL", wonPerLiter: 100 }, { brand: "SK에너지", wonPerLiter: 30 }, { brand: "E1", wonPerLiter: 20 }],
);
const sOil = [{ brand: "S-OIL", wonPerLiter: 100 }];
assert.equal(d.effectivePrice(1680, "S-OIL", sOil), 1580);
assert.equal(d.effectivePrice(50, "S-OIL", sOil), 0);
assert.equal(d.effectivePrice(1680, "농협알뜰", [{ brand: "알뜰주유소", wonPerLiter: 40 }]), 1640);
assert.equal(d.effectivePrice(1680, "GS칼텍스", sOil), 1680);
const prefs = { discounts: [{ brand: "S-OIL", wonPerLiter: 100 }, { brand: "GS칼텍스", wonPerLiter: 50 }], excludeBrands: ["SK에너지"] };
assert.deepEqual(d.prefsQuery(prefs), { discounts: "S-OIL:100,GS칼텍스:50", exclude: "SK에너지" });
assert.deepEqual(d.prefsFrom(new URLSearchParams(d.prefsQuery(prefs))), prefs);
assert.deepEqual(d.prefsQuery(d.NO_PREFS), {});
assert.deepEqual(d.prefsFrom(new URLSearchParams("")), d.NO_PREFS);
for (const bad of ["discounts=S-OIL", "discounts=S-OIL:0", "discounts=모름:100", "exclude=모름"]) {
  assert.throws(() => d.prefsFrom(new URLSearchParams(bad)), RangeError, bad);
}
const old = pr.cleanProfile({ name: "재원", fuel: "경유" });
assert.deepEqual([old.monthlyKm, old.discounts, old.excludeBrands, old.ureaNeeded, old.home, old.work], [null, [], [], false, null, null]);
assert.equal(pr.cleanProfile({ fuel: "휘발유", ureaNeeded: true }).ureaNeeded, false);
assert.equal(pr.cleanProfile({ fuel: "경유", ureaNeeded: true }).ureaNeeded, true);
assert.deepEqual([50, 1200, 1200.4, 20000].map((km) => pr.cleanProfile({ monthlyKm: km }).monthlyKm), [null, 1200, 1200, null]);
assert.deepEqual(pr.cleanProfile({ home: { label: "울주군청", x: 502243, y: 330555 } }).home, { label: "울주군청", x: 502243, y: 330555 });
assert.equal(pr.cleanProfile({ work: { label: "회사", x: 1, y: 1 } }).work, null);
assert.deepEqual(pr.prefsOf(pr.cleanProfile({ discounts: sOil, excludeBrands: ["E1", "E1", "모름"] })), { discounts: sOil, excludeBrands: ["E1"] });
console.log("run13 통과");
```

머리에는 run7.mjs처럼 `import assert from "node:assert/strict"; const root = process.env.APP_ROOT;`를 둔다.

- [ ] **Step 2: 실패 확인** — Run: `t run13` / Expected: `discounts.ts`를 못 찾는 ERR_MODULE_NOT_FOUND
- [ ] **Step 3: `discounts.ts`를 만들고 profile.ts에 필드를 더한다.** monthlyKm은 `Math.round(Number(x))`가 100~10,000이면 받는다. ureaNeeded는 `fuel === "경유" && item.ureaNeeded === true`. home·work는 `cleanPlace`. `prefsFrom`은 cleanDiscounts로 거르기 전에 항목 수가 바뀌면(틀린 항목이 있으면) RangeError를 던진다.
- [ ] **Step 4: 통과 확인** — Run: `t run13 && t run7 && t run9` / Expected: `run13 통과`, 기존 두 테스트도 통과
- [ ] **Step 5: 커밋** — `git add src/lib/discounts.ts src/lib/profile.ts && git commit -m "내 정보에 할인·주행거리·자주 가는 곳·요소수 필드"`

### Task 2: 개인 계산(personal.ts)

**Files:**
- Create: `src/lib/personal.ts`, `src/lib/stationName.ts`, `src/lib/savedVsArea.ts`
- Modify: `src/lib/fillForecast.ts`(`notifyDay` 내보내기), `src/lib/fuelEconomy.ts`(`measuredSpans` 내보내기), `src/lib/fillTotals.ts`(`vsAreaKey`), `src/lib/stations.ts`(coreName을 stationName.ts에서 가져오기)
- Test: `$S/apptest/run14.mjs`

**Interfaces:**
- Consumes: Task 1의 `Discount`, `bestDiscount`; 기존 `forecastRecords`, `forecastNextFill`, `totals`, `monthFingerprint`, `taxCutImpact`, `FUEL_TAX_CUT`, `wonName`, `amountName`, `Fill`, `Amount`
- Produces:
  - `notifyDay(nextDate: string, today: string): string` (fillForecast.ts; forecastNextFill이 이것을 쓴다) — 예상일이 든 주의 월요일, 지났으면 오늘
  - `measuredSpans(ledger: LedgerEntry[]): { from: string; to: string; km: number; liters: number }[]` (fuelEconomy.ts; measuredKmpl이 이것을 쓴다)
  - `coreName(name: string): string`, `sameStation(a: string, b: string): boolean` (stationName.ts, stations.ts에서 옮김), `searchName(name: string): string`(Task 3이 쓴다)
  - `vsAreaKey(fuel: string, areaCode: string, entries: LedgerEntry[], month: string): string` (fillTotals.ts) — 단가 있는 기록이 없으면 ""
  - savedVsArea.ts: `type VsArea = { fingerprint: string; area: string; savedWon: number; comparedFills: number; provisionalOn?: string }`, `vsAreaStore`, `parseVsArea` (RecordsDashboard에서 옮김)
  - personal.ts:
    - `DAYS_PER_MONTH = 30`
    - `type FillPlan = { basis: "records" | "monthlyKm"; gapDays: number; lastDate: string | null; nextDate: string; notifyOn: string; due: boolean; typicalWon: number | null }`
    - `fillPlan(i: { entries: LedgerEntry[]; monthlyKm: number | null; kmpl: number; fillLiters: number | null; today: string }): FillPlan | null`
    - `type AreaPrice = { date: string; fuel: string; area: string; areaName: string; price: number; scope: "local" | "national" }`
    - `type FillCost = { kind: "won" | "full"; won: number; liters: number; priceBasis: string | null; discount: Discount | null; discountSavedWon: number }`
    - `fillCost(i: { amount: Amount; fill: Fill | null; areaPrice: AreaPrice | null; discounts: Discount[] }): FillCost | null`
    - `costPhrase(cost: FillCost, amount: Amount): string`
    - `type TaxSchedule = { endsOn: string; daysLeft: number; fillsBefore: number | null; nextAfterEnd: boolean; maxExtraWon: number | null; wonPerLiter: number }`
    - `taxSchedule(i: { fuel: string; plan: FillPlan | null; liters: number | null; today: string }): TaxSchedule | null`
    - `taxLine(tax: TaxSchedule, fillLabel: string | null): string`
    - `type MonthProjection = { month: string; spentWon: number; remainingFills: number; projectedWon: number; lastMonthWon: number | null }`
    - `monthProjection(i: { entries: LedgerEntry[]; plan: FillPlan | null; perFillWon: number | null; today: string }): MonthProjection | null`
    - `favoriteStation(entries: LedgerEntry[], today: string): { name: string; visits: number; basis: "frequent" | "latest" } | null`
    - `monthlyLiters(i: { entries: LedgerEntry[]; today: string; monthlyKm: number | null; kmpl: number }): { liters: number; basis: "records" | "monthlyKm" } | null`
    - `yearSavings(i: { stored: Record<string, VsArea>; entries: LedgerEntry[]; fuel: string; areaCode: string; today: string }): { savedWon: number; checkedMonths: number; includesThisMonth: boolean; uncheckedMonths: string[] }`
    - `kmplTrend(entries: LedgerEntry[]): { date: string; kmpl: number }[]` — 최근 6구간

규칙(테스트가 정하지 않는 부분):
- `fillPlan`: forecastRecords가 2번 이상이면 forecastNextFill을 쓰고, RangeError면 한 달 주행거리로 넘어간다. 한 달 주행거리 경로는 `gapDays = max(1, round(fillLiters × kmpl ÷ (monthlyKm ÷ 30)))`, 기준일은 장부의 마지막 날짜(없으면 오늘), typicalWon은 null.
- `fillCost`: 금액이면 won = 금액, liters = fill.liters, discountSavedWon = round(liters × 가장 큰 할인). 가득이면 areaPrice가 있어야 하고 won = round((평균가 − 가장 큰 할인) × liters ÷ 100) × 100, priceBasis = `${areaName} 평균가`(scope가 national이면 "전국 평균가"). fill이 없으면 null.
- `taxSchedule`: 오늘이 종료일 뒤면 null. 첫 주유일 = max(nextDate, today). 종료일 뒤면 fillsBefore 0, 아니면 `1 + floor((종료일 − 첫 주유일) ÷ gapDays)`. plan이 없으면 fillsBefore null, nextAfterEnd false.
- `monthProjection`: 첫 주유일 = max(nextDate, today)부터 gapDays씩 더해 이번 달 안의 날만 센다.
- `favoriteStation`: 최근 90일(today − 90일 이상) 기록을 `coreName`으로 묶는다. 이름은 가장 최근 표기를 쓴다. 2번 이상 간 곳 중 많이 간 곳, 같으면 최근에 간 곳. 없으면 전체 장부의 마지막 주유소(basis "latest").
- `monthlyLiters`: 최근 90일 안의 리터 합 ÷ max(30, 그 안 첫 기록부터 오늘까지 날 수) × 30, 반올림. 리터 기록이 없으면 monthlyKm ÷ kmpl.
- `yearSavings`: 올해 1월부터 이번 달까지, 단가 있는 기록이 있는 달마다 `vsAreaKey`가 저장값의 fingerprint와 같으면 확인한 달이다(이번 달은 `provisionalOn === today`일 때만). 지난 달인데 확인하지 않았으면 uncheckedMonths에 넣는다. 이번 달은 넣지 않는다.

- [ ] **Step 1: 실패하는 테스트 run14.mjs 쓰기**

```js
const p = await import(root + "/src/lib/personal.ts");
const e = (date, more = {}) => ({ date, liters: null, pricePerLiter: null, totalWon: 50000, stationName: null, full: false, odometerKm: null, ...more });
// 다음 주유 계획
const byKm = p.fillPlan({ entries: [], monthlyKm: 1200, kmpl: 12, fillLiters: 40, today: "2026-11-14" });
assert.deepEqual(byKm, { basis: "monthlyKm", gapDays: 12, lastDate: null, nextDate: "2026-11-26", notifyOn: "2026-11-23", due: false, typicalWon: null });
const byRec = p.fillPlan({ entries: [e("2026-10-20"), e("2026-11-03")], monthlyKm: null, kmpl: 12, fillLiters: 40, today: "2026-11-14" });
assert.equal(byRec.basis, "records"); assert.equal(byRec.nextDate, "2026-11-17"); assert.equal(byRec.typicalWon, 50000);
assert.equal(p.fillPlan({ entries: [e("2026-11-03")], monthlyKm: null, kmpl: 12, fillLiters: 40, today: "2026-11-14" }), null);
// 예상 비용
const area = { date: "2026-11-14", fuel: "휘발유", area: "1831", areaName: "울산 울주군", price: 1700, scope: "local" };
const full = p.fillCost({ amount: "full", fill: { liters: 45, label: "가득(약 45L)" }, areaPrice: area, discounts: [{ brand: "S-OIL", wonPerLiter: 100 }] });
assert.deepEqual([full.won, full.discountSavedWon, full.kind], [72000, 4500, "full"]);
assert.equal(p.costPhrase(full, "full"), "가득이면 약 7만 2천원(울산 울주군 평균가 기준, S-OIL 리터당 100원 할인 반영)");
const byWon = p.fillCost({ amount: 50000, fill: { liters: 27, label: "5만원어치(약 27L)" }, areaPrice: null, discounts: [{ brand: "S-OIL", wonPerLiter: 100 }] });
assert.deepEqual([byWon.won, byWon.liters, byWon.discountSavedWon], [50000, 27, 2700]);
assert.equal(p.costPhrase(byWon, 50000), "평소처럼 5만원어치면 약 27L · S-OIL에서 넣으면 할인으로 약 2,700원 아껴요");
assert.equal(p.fillCost({ amount: "full", fill: { liters: 45 }, areaPrice: null, discounts: [] }), null); // Review Focus 3
// 유류세 일정
const tax = p.taxSchedule({ fuel: "휘발유", plan: byKm, liters: 45, today: "2026-11-14" });
assert.deepEqual([tax.daysLeft, tax.fillsBefore, tax.nextAfterEnd], [78, 6, false]);
assert.equal(p.taxLine(tax, "가득(약 45L)"), "유류세 인하 끝나기까지 78일 · 그 전에 약 6번 더 넣어요");
const late = p.taxSchedule({ fuel: "휘발유", plan: { ...byKm, nextDate: "2027-02-03" }, liters: 45, today: "2027-01-25" });
assert.deepEqual([late.fillsBefore, late.nextAfterEnd, late.maxExtraWon], [0, true, 5490]);
assert.match(p.taxLine(late, "가득(약 45L)"), /1월 31일 전에 넣으면 가득\(약 45L\)에 최대 5,490원 덜 들어요/);
assert.equal(p.taxSchedule({ fuel: "휘발유", plan: byKm, liters: 45, today: "2027-02-01" }), null);
// 이번 달 예상
const month = p.monthProjection({ entries: [e("2026-10-06", { totalWon: 45000 }), e("2026-10-20"), e("2026-11-03")],
  plan: { ...byRec, nextDate: "2026-11-17", gapDays: 14 }, perFillWon: 50000, today: "2026-11-14" });
assert.deepEqual(month, { month: "2026-11", spentWon: 50000, remainingFills: 1, projectedWon: 100000, lastMonthWon: 95000 });
const jan = p.monthProjection({ entries: [e("2026-12-28")], plan: { ...byRec, nextDate: "2027-01-10", gapDays: 14 }, perFillWon: 50000, today: "2027-01-05" });
assert.deepEqual([jan.lastMonthWon, jan.remainingFills], [50000, 2]); // Review Focus 4
const dec = p.monthProjection({ entries: [], plan: { ...byRec, nextDate: "2026-12-25", gapDays: 7 }, perFillWon: 50000, today: "2026-12-20" });
assert.equal(dec.remainingFills, 1);
// 단골
const s = (date, stationName) => e(date, { stationName });
assert.deepEqual(p.favoriteStation([s("2026-10-01", "A주유소"), s("2026-10-10", "B주유소"), s("2026-10-20", "A주유소"), s("2026-11-05", "B주유소")], "2026-11-14"),
  { name: "B주유소", visits: 2, basis: "frequent" });
assert.deepEqual(p.favoriteStation([s("2026-11-01", "㈜이림 언양주유소"), s("2026-11-10", "(주)이림 언양주유소")], "2026-11-14"),
  { name: "(주)이림 언양주유소", visits: 2, basis: "frequent" }); // Review Focus 5
assert.deepEqual(p.favoriteStation([s("2026-05-01", "A주유소"), s("2026-05-09", "A주유소"), s("2026-11-01", "C주유소")], "2026-11-14"),
  { name: "C주유소", visits: 1, basis: "latest" });
assert.equal(p.favoriteStation([e("2026-11-01")], "2026-11-14"), null);
// 한 달에 넣는 양
assert.deepEqual(p.monthlyLiters({ entries: [e("2026-10-20", { liters: 40 }), e("2026-11-03", { liters: 40 })], today: "2026-11-14", monthlyKm: null, kmpl: 12 }), { liters: 80, basis: "records" });
assert.deepEqual(p.monthlyLiters({ entries: [], today: "2026-11-14", monthlyKm: 1200, kmpl: 12 }), { liters: 100, basis: "monthlyKm" });
// 올해 아낀 돈
const priced = (date) => e(date, { liters: 30, pricePerLiter: 1700, totalWon: 51000 });
const entries = [priced("2026-09-05"), priced("2026-10-05"), priced("2026-11-05")];
const tl = await import(root + "/src/lib/fillTotals.ts");
const key = (m) => tl.vsAreaKey("휘발유", "1831", entries, m);
const stored = { "2026-09": { fingerprint: key("2026-09"), area: "울산", savedWon: 3000, comparedFills: 1 },
  "2026-10": { fingerprint: "옛날", area: "울산", savedWon: 9999, comparedFills: 1 },
  "2026-11": { fingerprint: key("2026-11"), area: "울산", savedWon: 1000, comparedFills: 1, provisionalOn: "2026-11-14" } };
assert.deepEqual(p.yearSavings({ stored, entries, fuel: "휘발유", areaCode: "1831", today: "2026-11-14" }),
  { savedWon: 4000, checkedMonths: 2, includesThisMonth: true, uncheckedMonths: ["2026-10"] });
assert.equal(p.yearSavings({ stored, entries, fuel: "휘발유", areaCode: "1831", today: "2026-11-15" }).includesThisMonth, false);
// 연비 추이
const f = (date, odometerKm, liters) => e(date, { full: true, odometerKm, liters });
assert.deepEqual(p.kmplTrend([f("2026-10-01", 10000, 40), f("2026-10-15", 10500, 40), f("2026-11-01", 11100, 45)]),
  [{ date: "2026-10-15", kmpl: 12.5 }, { date: "2026-11-01", kmpl: 13.3 }]);
console.log("run14 통과");
```

- [ ] **Step 2: 실패 확인** — Run: `t run14` / Expected: personal.ts를 못 찾는 ERR_MODULE_NOT_FOUND
- [ ] **Step 3: 위 Interfaces와 규칙대로 구현한다.** fillForecast·fuelEconomy·stations는 동작이 바뀌지 않게 함수만 꺼낸다. RecordsDashboard의 vsAreaStore·parseVsArea·VsArea를 savedVsArea.ts로 옮기고, 지문 계산을 `vsAreaKey`로 바꾼다(지금 지문 `${fuel}|${area}|${priced}`와 같은 값).
- [ ] **Step 4: 통과 확인** — Run: `t run14 && t run13 && t run7 && t run8 && t run9 && t run11` / Expected: 모두 통과(실측 연비·예보가 그대로)
- [ ] **Step 5: 커밋** — `git add -A src/lib src/components/RecordsDashboard.tsx && git commit -m "개인 계산을 한 곳에: 다음 주유 계획·예상 비용·유류세 일정·단골·아낀 돈·연비 추이"`

### Task 3: 추천에 할인·뺀 상표 반영, 출퇴근 길·단골·요소수 조회 주소

**Files:**
- Modify: `src/lib/stations.ts`(findNearby, findByTotalCost, findCheapest, stationStanding에 prefs; 새 findStationByName, findCommute)
- Modify: `src/app/api/stations/{nearby,total-cost,cheapest}/route.ts`(prefsFrom)
- Create: `src/app/api/stations/{favorite,urea,commute}/route.ts`
- Test: `$S/apptest/run15.mjs`

**Interfaces:**
- Consumes: Task 1 `Prefs`, `NO_PREFS`, `prefsFrom`, `discountFor`, `effectivePrice`, `isExcluded`; Task 2 `sameStation`, `coreName`
- Produces:
  - 할인이 붙는 주유소 행 공통 필드: `price`(오피넷), `discountWon`, `paidPrice`(= effectivePrice)
  - `findNearby(fuel, origin, count = 5, prefs = NO_PREFS)` → 지금 결과 + `excludedCount: number`; 순위는 paidPrice, 같으면 거리
  - `findByTotalCost(fuel, origin, fill, kmpl, prefs = NO_PREFS)` → fillWon·tripWon·breakEven은 paidPrice로 셈, cheapest는 paidPrice 최저, `excludedCount`
  - `findCheapest(fuel, area, count = 5, prefs = NO_PREFS)` → prefs가 비어 있지 않으면 lowTop10을 `cnt=10`으로 받아 거르고 paidPrice 순으로 count개, `excludedCount`
  - `stationStanding(id, fuel, prefs = NO_PREFS)` → nearby의 다른 주유소에서 뺀 상표를 거르고, cheaperOption은 paidPrice가 이 주유소의 paidPrice보다 낮은 곳 중 최저(`paidPrice`, `discountWon`, `cheaperByWon` = 내 paidPrice − 그곳 paidPrice)
  - `findStationByName(name: string, area: string | null): Promise<{ id: string; name: string; brand: string } | null>` — 검색어는 `searchName(name)`(stationName.ts: 회사 표시 `(주)|㈜|주식회사|(유)|유한회사|(합)`와 끝의 '주유소'를 떼고 띄어쓰기는 남김, 예 "㈜이림 언양주유소" → "이림 언양"). 결과에서 sameStation이 맞는 첫 곳, 없고 결과가 1곳이면 그곳, 아니면 null
  - `findCommute(fuel, home: Origin, work: Origin, prefs = NO_PREFS)` → `{ fuel, home: string, work: string, overlap: CommuteStation[], nearHome: CommuteStation | null, nearWork: CommuteStation | null, excludedCount, fetchedAt, fetchedAtKst, distanceNote }`, `CommuteStation = { id, name, brand, price, discountWon, paidPrice, homeKm: number | null, workKm: number | null }`. overlap은 두 aroundAll에 모두 나온 곳을 homeKm + workKm 짧은 순(같으면 paidPrice)으로 5곳. overlap이 없을 때만 nearHome·nearWork에 각 끝의 paidPrice 최저를 넣는다.
  - `GET /api/stations/favorite?name=&area=&fuel=&discounts=&exclude=` → `{ found: {id,name,brand} | null, standing: Awaited<ReturnType<typeof stationStanding>> | null }`
  - `GET /api/stations/urea?sido=31&x=&y=&label=` → findUrea(sido, null, x·y가 있으면 origin 아니면 null, 3)
  - `GET /api/stations/commute?fuel=&hx=&hy=&hlabel=&wx=&wy=&wlabel=&discounts=&exclude=`
  - 세 새 경로 모두 limitByClient(request, "data"), RangeError → 400, OpinetError → 502 (지금 경로와 같은 모양)

- [ ] **Step 1: 실패하는 테스트 run15.mjs 쓰기.** run7처럼 가짜 fetch를 두고 `st`(stations.ts), `fa`(fillAmount.ts), `d`(discounts.ts)를 import한다. aroundAll은 `x` 값으로 응답을 나눈다: 500000 → 집 목록, 510000 → 회사 목록, 520000 → 단골(Y1) 근처 목록(Y1 S-OIL 1750, S1 SK에너지 1600, G1 "GS주유소" GS칼텍스 1640 1.2km), 그 밖 → 빈 목록.

```js
// 집 근처: H1 SK에너지 1650 0.5km, H2 S-OIL 1700 1.0km, C1 GS칼텍스 1690 2.0km(회사에서 3.0km), C2 S-OIL 1720 4.0km(회사에서 1.0km)
// 회사 근처: C1, C2, W1 농협알뜰 1660 0.3km
const prefs = { discounts: [{ brand: "S-OIL", wonPerLiter: 100 }], excludeBrands: ["SK에너지"] };
const home = { name: "집", x: 500000, y: 300000 }, work = { name: "회사", x: 510000, y: 300000 };
const near = await st.findNearby("휘발유", home, 5, prefs);
assert.deepEqual(near.stations.map((s) => [s.id, s.paidPrice, s.discountWon]), [["H2", 1600, 100], ["C2", 1620, 100], ["C1", 1690, 0]]);
assert.equal(near.excludedCount, 1);
assert.equal(near.stations[0].price, 1700); // 오피넷 가격은 그대로
const plain = await st.findNearby("휘발유", home);
assert.equal(plain.stations[0].id, "H1"); assert.equal(plain.excludedCount, 0);
const allOut = await st.findNearby("휘발유", home, 5, { discounts: [], excludeBrands: ["SK에너지", "S-OIL", "GS칼텍스"] });
assert.deepEqual([allOut.stations.length, allOut.excludedCount], [0, 4]); // Review Focus 1
const both = await st.findNearby("휘발유", home, 5, { discounts: [{ brand: "S-OIL", wonPerLiter: 100 }], excludeBrands: ["S-OIL"] });
assert.deepEqual(both.stations.map((s) => s.id), ["H1", "C1"]); // Review Focus 2
const cost = await st.findByTotalCost("휘발유", home, fa.litersFill(40), 12, prefs);
assert.equal(cost.stations[0].id, "H2");
assert.equal(cost.stations[0].fillWon, 1600 * 40);
assert.equal(cost.excludedCount, 1);
const commute = await st.findCommute("휘발유", home, work, prefs);
assert.deepEqual(commute.overlap.map((s) => [s.id, s.homeKm, s.workKm]), [["C2", 4, 1], ["C1", 2, 3]]);
assert.equal(commute.nearHome, null);
const apart = await st.findCommute("휘발유", home, { name: "먼 곳", x: 700000, y: 300000 }, prefs);
assert.deepEqual([apart.overlap.length, apart.nearHome.id, apart.nearWork], [0, "H2", null]);
assert.deepEqual(await st.findStationByName("㈜이림 언양주유소", "1831"), { id: "Y1", name: "(주)이림 언양주유소", brand: "S-OIL" });
assert.equal(await st.findStationByName("없는주유소", "1831"), null);
const standing = await st.stationStanding("Y1", "휘발유", prefs); // 상세: S-OIL 1750, 근처에 SK에너지 1600(뺌), GS칼텍스 1640
assert.equal(standing.nearby.cheaperOption.name, "GS주유소");
assert.equal(standing.nearby.cheaperOption.cheaperByWon, 1650 - 1640);
assert.throws(() => d.prefsFrom(new URLSearchParams("discounts=S-OIL:abc")), RangeError);
console.log("run15 통과");
```

searchByName 가짜 응답은 Y1 "(주)이림 언양주유소"와 Y2 "언양제일주유소"를 돌려준다(osnm에 '이림'이나 '언양'이 들어 있을 때). detailById(Y1)는 GIS 좌표 520000·300000과 SIGUNCD 1831, avgSigunPrice는 1700을 준다.

- [ ] **Step 2: 실패 확인** — Run: `t run15` / Expected: `findCommute is not a function` 또는 첫 deepEqual 실패
- [ ] **Step 3: Interfaces대로 stations.ts와 경로 여섯 개를 바꾼다.** aroundRows가 행마다 discountWon·paidPrice를 붙이는 공통 함수(`priced(row, prefs)`)를 쓴다.
- [ ] **Step 4: 통과 확인** — Run: `t run15 && t run7 && t run9 && t run12` / Expected: 모두 통과
- [ ] **Step 5: 커밋** — `git add src/lib/stations.ts src/app/api/stations && git commit -m "추천에 할인·뺀 상표 반영, 출퇴근 길·단골·요소수 조회"`

### Task 4: 알림 엔진(conditions.ts, Watch)

**Files:**
- Modify: `src/lib/conditions.ts`, `src/lib/watchSettings.ts`
- Modify: `$S/apptest/run7.mjs`(buildNotices 호출을 새 입력으로)
- Test: `$S/apptest/run16.mjs`

**Interfaces:**
- Consumes: Task 2 `FillPlan`, `FillCost`, `TaxSchedule`, `MonthProjection`, `costPhrase`
- Produces:
  - `Watch = { tax; cap; forecast; monthly; favorite; urea }` (모두 boolean, 기본 false)
  - `type Personal = { plan: FillPlan | null; cost: FillCost | null; tax: TaxSchedule | null; projection: MonthProjection | null; amount: Amount; monthlyKm: number | null; favoriteName: string | null; ureaNeeded: boolean }`
  - `type FavoriteCheck = { fetchedAt: string; name: string; areaName: string; diffWon: number; cheaper: { name: string; paidPrice: number; discountWon: number; distanceKm: number } | null } | { error: string }`
  - `type UreaCheck = { fetchedAt: string; from: string | null; station: { name: string; distanceKm: number | null; pricePerLiter: number | null } | null } | { error: string }`
  - `buildNotices({ watch, car, alerts, checks, personal, favorite?: FavoriteCheck, urea?: UreaCheck, today })` — `fills`는 없앤다
  - Notice.kind에 `"favorite" | "urea" | "monthly"`, ORDER = price 0, favorite 1, urea 2, cap 3, tax 4, forecast 5, monthly 6
  - `RULES`에 `favoriteOverWon: 30, monthlyDay: 25`
  - `josa(word: string, withFinal: string, withoutFinal: string): string` — 끝 글자 받침으로 '이/가', '은/는'을 고른다(한글이 아니면 withoutFinal). 이름 뒤 조사는 모두 이것으로 붙인다.

문구(스펙이 정한 값):
- 주유 예보 message: `${dayWithWeekday(next)}쯤 주유할 때예요.` + (cost ? ` ${costPhrase}.` : "") + (tax && !nextAfterEnd ? ` 유류세 인하는 ${monthDay(endsOn)}까지라 이번 주유는 인하 기간 안이에요.` : tax?.nextAfterEnd ? ` 유류세 인하가 ${monthDay(endsOn)}에 끝나요. 그 전에 넣으면 덜 들어요.` : "") + (basis monthlyKm ? " 기록이 없어 한 달 주행거리로 셈했어요." : "") + " 알림 받는 날 가격으로 근처에서 덜 드는 곳을 골라 드려요."
- 주유 예보 state: records면 `평균 ${gap}일마다 넣어요. 다음은 ${day}쯤이에요.`, monthlyKm이면 `한 달 ${km.toLocaleString("ko-KR")}km면 ${gap}일마다 넣을 것 같아요. 다음은 ${day}쯤이에요.`, plan이 없으면 `주유 기록을 2번 남기거나 내 정보에 한 달 주행거리를 넣으면 예보해요.`
- 월말 예상 message: `이번 달 기름값은 약 ${wonName(projected)} 쓸 것 같아요(지금까지 ${wonName(spent)}${last ? `, 지난달 ${wonName(last)}` : ""}). 주유 장부로 셈했어요.` readyOn은 이번 달 25일, 오늘이 26일 이후면 null이고 state `다음 달 25일에 알려요.`
- 단골 message(diffWon ≥ 30): `${name}${josa(name, "이", "가")} ${areaName} 평균보다 리터당 ${won(diff)}원 비싸요(${koreanTime(fetchedAt)} 오피넷 기준).` + (cheaper ? ` 근처 ${cheaper.name}${josa(cheaper.name, "은", "는")} 리터당 ${won(cheaper.paidPrice)}원${cheaper.discountWon ? "(할인 반영)" : ""}, 직선 ${cheaper.distanceKm}km예요.` : "")
- 요소수 message: `${from ? `${from} 근처 ` : ""}요소수 재고가 있는 곳: ${name}${km !== null ? ` 직선 ${km}km` : ""}${price ? `, 리터당 ${won(price)}원` : ""}(${koreanTime(fetchedAt)} 오피넷 기준). 가기 전에 전화로 재고를 확인하세요.`
- watch.urea가 켜져 있어도 `personal.ureaNeeded`가 false면 요소수 알림을 만들지 않는다.

- [ ] **Step 1: 실패하는 테스트 run16.mjs 쓰기**

```js
const watch = { tax: false, cap: false, forecast: true, monthly: true, favorite: true, urea: true };
const car = { fuel: "휘발유", fill: null };
const plan = { basis: "monthlyKm", gapDays: 12, lastDate: null, nextDate: "2026-11-26", notifyOn: "2026-11-23", due: false, typicalWon: null };
const cost = { kind: "full", won: 72000, liters: 45, priceBasis: "울산 울주군 평균가", discount: { brand: "S-OIL", wonPerLiter: 100 }, discountSavedWon: 4500 };
const tax = { endsOn: "2027-01-31", daysLeft: 78, fillsBefore: 6, nextAfterEnd: false, maxExtraWon: 5490, wonPerLiter: 122 };
const personal = { plan, cost, tax, projection: { month: "2026-11", spentWon: 50000, remainingFills: 1, projectedWon: 100000, lastMonthWon: 95000 },
  amount: "full", monthlyKm: 1200, favoriteName: "(주)이림 언양주유소", ureaNeeded: false };
const notices = cd.buildNotices({ watch, car, alerts: [], checks: {}, personal, today: "2026-11-14" });
const by = (kind) => notices.find((n) => n.kind === kind);
assert.match(by("forecast").message, /11월 26일\(목\)쯤 주유할 때예요\. 가득이면 약 7만 2천원/);
assert.match(by("forecast").message, /인하 기간 안이에요\. 기록이 없어 한 달 주행거리로 셈했어요/);
assert.equal(by("forecast").readyOn, "2026-11-23");
assert.match(by("forecast").state, /한 달 1,200km면 12일마다/);
assert.equal(by("monthly").readyOn, "2026-11-25");
assert.equal(by("monthly").message, "이번 달 기름값은 약 10만원 쓸 것 같아요(지금까지 5만원, 지난달 9만 5천원). 주유 장부로 셈했어요.");
assert.equal(by("favorite").readyOn, null);
assert.equal(by("urea"), undefined); // 요소수가 필요 없는 차
const fav = { fetchedAt: "2026-11-14T01:00:00Z", name: "(주)이림 언양주유소", areaName: "울산 울주군", diffWon: 35, cheaper: { name: "GS주유소", paidPrice: 1640, discountWon: 0, distanceKm: 1.2 } };
const hot = cd.buildNotices({ watch, car, alerts: [], checks: {}, personal, favorite: fav, today: "2026-11-14" });
assert.match(hot.find((n) => n.kind === "favorite").message, /\(주\)이림 언양주유소가 울산 울주군 평균보다 리터당 35원 비싸요.*근처 GS주유소는 리터당 1,640원, 직선 1.2km예요/);
const mild = cd.buildNotices({ watch, car, alerts: [], checks: {}, personal, favorite: { ...fav, diffWon: 29 }, today: "2026-11-14" });
assert.equal(mild.find((n) => n.kind === "favorite").readyOn, null);
const urea = cd.buildNotices({ watch, car: { fuel: "경유", fill: null }, alerts: [], checks: {}, personal: { ...personal, ureaNeeded: true },
  urea: { fetchedAt: "2026-11-14T01:00:00Z", from: "집", station: { name: "요소수주유소", distanceKm: 2.1, pricePerLiter: 1500 } }, today: "2026-11-14" });
assert.match(urea.find((n) => n.kind === "urea").message, /집 근처 요소수 재고가 있는 곳: 요소수주유소 직선 2.1km, 리터당 1,500원/);
const none = cd.buildNotices({ watch, car, alerts: [], checks: {}, personal: { ...personal, plan: null, projection: null }, today: "2026-11-27" });
assert.match(none.find((n) => n.kind === "forecast").state, /주유 기록을 2번 남기거나/);
assert.equal(none.find((n) => n.kind === "monthly").readyOn, null);
const w = await import(root + "/src/lib/watchSettings.ts");
assert.deepEqual(w.parseWatch('{"tax":true}'), { tax: true, cap: false, forecast: false, monthly: false, favorite: false, urea: false });
console.log("run16 통과");
```

- [ ] **Step 2: 실패 확인** — Run: `t run16` / Expected: forecast 문구 assert 실패
- [ ] **Step 3: conditions.ts와 watchSettings.ts를 Interfaces대로 바꾸고, run7의 buildNotices 세 곳을 `personal: { plan: null, cost: null, tax: null, projection: null, amount: "full", monthlyKm: null, favoriteName: null, ureaNeeded: false }`로 고친다.**
- [ ] **Step 4: 통과 확인** — Run: `t run16 && t run7` / Expected: 둘 다 통과
- [ ] **Step 5: 커밋** — `git add src/lib/conditions.ts src/lib/watchSettings.ts && git commit -m "알림: 개인 예보 문구와 월말·단골·요소수 조건"`

### Task 5: 채팅이 선호를 쓰기

**Files:**
- Modify: `src/lib/chatbot.ts`(profileBlock, runTool의 find_by_total_cost·find_nearby_stations·find_cheapest_stations)
- Test: `$S/apptest/run17.mjs`(run7의 가짜 Anthropic·오피넷 틀을 복사)

**Interfaces:**
- Consumes: Task 1 `prefsOf`, Task 3의 prefs 인자
- Produces: 지시문 줄 `- 할인: S-OIL 리터당 100원. 뺀 상표: SK에너지. 근처 최저가·거리까지 고려한 추천·지역 최저가는 이 할인을 빼고 뺀 상표를 거른 결과입니다. 답에서 할인 전 오피넷 가격과 할인액을 함께 밝히고, 거른 곳이 있으면 몇 곳 뺐는지 말합니다.` (할인이나 뺀 상표가 있을 때만, 없는 쪽 문장은 뺀다)

- [ ] **Step 1: 실패하는 테스트** — 로그인한 profile(`discounts: [{ brand: "S-OIL", wonPerLiter: 100 }], excludeBrands: ["SK에너지"]`)로 `cb.answer`를 부르고, scripted에 `find_by_total_cost` tool_use를 넣는다. `assert.match(sent[0].system, /할인: S-OIL 리터당 100원\. 뺀 상표: SK에너지/)`, 두 번째 요청의 tool_result에 `"excludedCount":1`과 `"discountWon":100`. 로그인 전 profile(GUEST)이면 system에 '할인:'이 없다.
- [ ] **Step 2: 실패 확인** — Run: `t run17` / Expected: system assert 실패
- [ ] **Step 3: 구현** — runTool의 세 도구에 `prefsOf(profile)`을 넘기고 profileBlock에 줄을 더한다.
- [ ] **Step 4: 통과 확인** — Run: `t run17 && t run7 && t run9 && t run-answer` / Expected: 모두 통과
- [ ] **Step 5: 커밋** — `git add src/lib/chatbot.ts && git commit -m "채팅 추천에 내 할인·뺀 상표 반영"`

### Task 6: 내 정보 입력(LoginForm)

**Files:**
- Modify: `src/components/LoginForm.tsx`

**Interfaces:**
- Consumes: Task 1의 Profile 필드, `BRAND_KEYS`, `DISCOUNT_LIMITS`; 기존 `placeGroups(area)`, `placeAt(key)`(places.ts), `toKatec`, `round100`, `inKorea`

화면(스펙 1절):
- 내 위치 칸 아래 '자주 가는 곳': 집·회사 줄마다 지금 값(`집 · 울주군청` 또는 '없음'), [지금 여기로 저장], [목록에서 고르기], 값이 있으면 [지우기]. 목록은 내 지역(`form.area`)의 출발 위치 목록을 `<select>`로 보이고, 고르면 `{ label: 장소 이름(12자), x, y }`. 지금 여기는 label "현재 위치", 좌표는 100m 단위.
- 내 차 칸: '한 달 주행거리' 숫자 입력(빈칸이면 null, 100~10,000 밖이면 저장할 때 오류 문구 "한 달 주행거리는 100~10,000km로 넣어 주세요."). 유종이 경유일 때만 '요소수가 필요한 차' 체크.
- 새 칸 '주유 할인·상표'(note: "넣은 할인은 추천 순위와 예상 비용에 반영돼요. 화면에는 오피넷 가격과 할인액을 함께 보여 줘요."): 할인 줄마다 상표 `<select>` + '리터당 ○원' 숫자 + [빼기], [할인 더하기](3개면 비활성). '빼고 싶은 상표'는 BRAND_KEYS 칩(`aria-pressed`).
- 저장은 지금처럼 '저장'을 눌러야 한다. 빈 할인 줄은 저장할 때 버린다.

- [ ] **Step 1: 칸 셋을 만든다.** 스타일은 LoginForm의 Section·칩·입력 클래스를 그대로 쓴다.
- [ ] **Step 2: 확인** — Run: `cd $W3 && npx tsc --noEmit && npx eslint src/components/LoginForm.tsx` / Expected: 오류 없음
- [ ] **Step 3: 미리보기 확인** — 로그인 화면에서 경유 → 요소수 체크 보임, 휘발유 → 사라짐. 할인 둘·뺀 상표 하나·한 달 1200km·집(목록)·회사(목록)를 넣고 저장 → 새로 고침 뒤에도 남음(`localStorage["kireumalimi.profile"]` 확인).
- [ ] **Step 4: 커밋** — `git add src/components/LoginForm.tsx && git commit -m "내 정보: 자주 가는 곳, 한 달 주행거리, 요소수, 할인·뺀 상표"`

### Task 7: 내 기록 '내 맞춤 요약'

**Files:**
- Create: `src/components/useAreaPrice.ts`, `src/components/usePersonal.ts`, `src/components/personalChecks.ts`, `src/components/PersonalSummary.tsx`
- Modify: `src/components/RecordsDashboard.tsx`

**Interfaces:**
- Consumes: Task 2 전부, Task 3의 `/api/stations/favorite`, 기존 `useFill`, `useFullLiters`, `/api/briefing`, `/api/fuel-report`, `vsAreaFinal`
- Produces:
  - `useAreaPrice(fuel: string, areaCode: string): AreaPrice | null` — `kireumalimi.areaPrice` 저장값이 오늘·같은 유종·같은 지역이면 그대로, 아니면 `/api/briefing?fuel&area`를 한 번 불러 local(없으면 national)을 저장. 실패하면 null(다시 부르지 않음, 그 화면에서만).
  - `usePersonal(profile: Profile, entries: LedgerEntry[], today: string | null, areaCode: string): { fill: Fill | null; plan; cost; tax; projection; favorite; monthly: ReturnType<typeof monthlyLiters>; trend; personal: Personal }` — 요약과 알림이 함께 쓴다. `areaCode`는 `profile.area?.code ?? 기본 지역`.
  - `checkFavorite(name: string, profile: Profile, monthly: { liters: number } | null): Promise<FavoriteCheck & { monthlySaveWon?: number; notFound?: boolean }>` — `/api/stations/favorite`에 prefsQuery를 붙여 부른다. monthlySaveWon = round(monthly.liters × (내 paidPrice − 더 싼 곳 paidPrice) ÷ 100) × 100.
  - `checkUrea(profile: Profile): Promise<UreaCheck>` — 집, 없으면 내 위치 좌표로 `/api/stations/urea?sido=${area 앞 2자리}`.
  - 단골을 오피넷에서 못 찾으면(`found: null`) 요약 줄은 "오피넷에서 '○○'을 찾지 못했어요. 탐색의 주유소 점검에서 이름을 바꿔 찾아 보세요."

요약 카드(스펙 3절의 그림 순서): 다음 주유 줄, 유류세 줄, 단골 줄 + [단골 주유소 점검], 이번 달 예상 줄(예상 · 약 ○km · 1km당 ○원; 예상이 없으면 지금까지 쓴 돈과 km만), 올해 아낀 돈 줄 + [나머지 달도 셈하기(○달 남음)], 실측 연비 추이(작은 막대 줄 + 최근 값). 각 줄은 숫자가 없으면 무엇을 남기면 보이는지 한 문장으로 안내한다. 기록도 한 달 주행거리도 없으면 맨 위에 "주유 기록을 2번 남기거나 내 정보에 한 달 주행거리를 넣으면 다음 주유일을 알려 드려요" + 내 정보(`/login`) 링크.

RecordsDashboard 변경: 이번 달 비교 결과가 기록을 다 견줬으면(comparedFills === pricedFills) `provisionalOn: today`로 vsAreaStore에 남기고, `cached`는 provisionalOn이 있으면 오늘일 때만 쓴다. '나머지 달도 셈하기'는 uncheckedMonths 앞에서 2달을 차례로 /api/fuel-report로 받고 vsAreaFinal이면 남긴다. 누르는 동안 버튼을 막는다.

- [ ] **Step 1: 훅 셋과 PersonalSummary를 만들고 RecordsDashboard 맨 위에 넣는다.**
- [ ] **Step 2: 확인** — Run: `cd $W3 && npx tsc --noEmit && npx eslint src && t run14` / Expected: 오류 없음, run14 통과
- [ ] **Step 3: 미리보기 확인(작업 복사본에는 오피넷 키가 없다)** — 브라우저 저장소에 장부 3번(단가·리터·주유소 이름, 가득·누적 주행거리 포함)을 직접 넣고 내 기록을 연다. 다음 주유·유류세·이번 달·연비 추이 줄이 장부 숫자로 맞게 나오는지, 평균가 조회가 실패해도 다른 줄이 보이는지, 페이지를 다시 열 때 /api/briefing을 다시 부르지 않는지(네트워크 목록) 본다. 휴대폰(375px)과 넓은 화면 모두. 확인 뒤 넣은 장부를 지운다.
- [ ] **Step 4: 커밋** — `git add src/components && git commit -m "내 기록: 내 맞춤 요약"`

### Task 8: 알림 탭

**Files:**
- Modify: `src/components/AlertsManager.tsx`

**Interfaces:**
- Consumes: Task 4 `buildNotices` 새 입력, Task 7 `usePersonal`, `checkFavorite`, `checkUrea`

- 예보 기록은 `mergeLedger(ledger, fills)`(내 기록과 같은 장부)로 셈한다.
- '제도·예보 조건'에 스위치 셋: '월말 예상 지출 알림(매달 25일)', '단골 주유소가 동네 평균보다 30원 넘게 비쌀 때', '요소수 재고 알림'. 요소수 스위치는 경유 + 요소수 필요일 때만 보이고, 아니면 "내 정보에서 요소수가 필요한 경유차로 고르면 켤 수 있어요."
- '가격 지금 점검' → '지금 점검'. 가격 조건 → 단골(켜져 있고 단골이 있을 때) → 요소수(켜져 있고 필요할 때) 순으로 부르고, 결과를 buildNotices의 checks·favorite·urea로 넘긴다.

- [ ] **Step 1: 위대로 바꾼다.**
- [ ] **Step 2: 확인** — Run: `cd $W3 && npx tsc --noEmit && npx eslint src && t run16` / Expected: 오류 없음
- [ ] **Step 3: 미리보기 확인** — 내 정보에 한 달 주행거리만 넣고 기록 없이 알림 탭을 연다. 주유 예보가 '한 달 주행거리로 셈했어요'를 담는지, 휘발유일 때 요소수 스위치가 안내 문구로 바뀌는지, '지금 점검' 글자가 바뀌었는지 본다.
- [ ] **Step 4: 커밋** — `git add src/components/AlertsManager.tsx && git commit -m "알림 탭: 월말·단골·요소수 조건과 지금 점검"`

### Task 9: 탐색과 결과 카드

**Files:**
- Modify: `src/components/ChatPanel.tsx`(조회 주소에 prefsQuery, `commute` 명령, 목록 행 할인 표시), `src/components/AnswerCards.tsx`(CostCard 할인·거른 곳, 새 CommuteCard), `src/components/ExploreDashboard.tsx`(출퇴근 길 상자, 요소수 상자 순서)

**Interfaces:**
- Consumes: Task 1 `prefsQuery`, `prefsOf`; Task 3 결과의 `price`·`discountWon`·`paidPrice`·`excludedCount`, `/api/stations/commute`
- Produces: `PanelCommand`에 `{ kind: "commute" }`

- 할인이 들어간 행: 큰 숫자는 paidPrice, 아래 줄 `오피넷 1,680원 · S-OIL 할인 −100원`. 할인 없는 행은 지금 그대로.
- excludedCount > 0이면 카드 아래 `뺀 상표 ○곳은 넣지 않았어요.` 목록이 비었으면 `뺀 상표를 빼니 반경 5km 안에 남은 곳이 없어요(○곳 뺌).`
- 출퇴근 길 상자: name '출퇴근 길', description '집과 회사 사이에서 덜 드는 곳', ai false, info `${fuel} · 집 ${home.label} ↔ 회사 ${work.label} · 직선거리`. 집이나 회사가 없으면 command null이고 info 대신 '내 정보에서 집과 회사를 저장하면 쓸 수 있어요'와 `/login` 링크.
- CommuteCard: 겹치는 곳 목록(이름·상표·paidPrice·집 ○km + 회사 ○km), 없으면 '집 근처'·'회사 근처' 두 줄. 맨 아래 '거리는 직선이라 실제 길은 다를 수 있어요.'
- 로그인했고 (경유가 아니거나 요소수가 필요 없으면) 요소수 상자를 boxes 맨 뒤로.

- [ ] **Step 1: 위대로 바꾼다.**
- [ ] **Step 2: 확인** — Run: `cd $W3 && npx tsc --noEmit && npx eslint src` / Expected: 오류 없음
- [ ] **Step 3: 미리보기 확인** — 휘발유 로그인이면 요소수 상자가 맨 뒤, 집·회사 없으면 출퇴근 길 상자가 내 정보로 안내. 집·회사를 넣으면 상자의 버튼이 켜지고 /api/stations/commute 주소에 hx·wx·discounts가 붙는지 네트워크 목록으로 본다(키가 없어 502가 나와도 오류 문구가 카드에 뜨는지).
- [ ] **Step 4: 커밋** — `git add src/components && git commit -m "탐색: 할인 반영 표시, 출퇴근 길, 요소수 상자 순서"`

### Task 10: 마무리 확인

- [ ] **Step 1:** Run: `cd $W3 && npx tsc --noEmit && npx eslint src && npx next build` / Expected: 오류 없음
- [ ] **Step 2:** Run: `for f in run run2 run3 run4 run7 run8 run9 run10 run11 run12 run13 run14 run15 run16 run17 run-answer; do t $f > $S/apptest/w3-$f.txt 2>&1 || echo "FAIL $f"; done; t run6 $S/ex/raw` / Expected: FAIL 줄 없음(run5는 원래 입력 파일이 없어 뺀다)
- [ ] **Step 3:** 미리보기에서 한 사람의 흐름: 내 정보 입력 → 내 기록 요약 → 알림 문구 → 탐색 추천. 휴대폰과 넓은 화면.
