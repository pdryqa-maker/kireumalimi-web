// 내 주유 할인과 빼고 싶은 상표. 내 정보에 저장하고, 추천 순위와 예상 비용에 함께 쓴다.
// 브라우저와 서버 모두에서 쓰므로 서버 모듈(오피넷 등)을 import하지 않는다.

// 내 정보에서 고를 수 있는 상표. 오피넷 상표 이름에 '알뜰'이 들어가면(자영·농협·고속도로) 모두 알뜰주유소로 본다.
export const BRAND_KEYS = ["SK에너지", "GS칼텍스", "HD현대오일뱅크", "S-OIL", "알뜰주유소", "E1", "SK가스"] as const;
export type BrandKey = (typeof BRAND_KEYS)[number];

export type Discount = { brand: BrandKey; wonPerLiter: number }; // 리터당 할인(원)
export type Prefs = { discounts: Discount[]; excludeBrands: BrandKey[] };
export const NO_PREFS: Prefs = { discounts: [], excludeBrands: [] };
export const DISCOUNT_LIMITS = { max: 3, minWon: 1, maxWon: 500 };

const isBrandKey = (value: unknown): value is BrandKey => BRAND_KEYS.includes(value as BrandKey);

export function brandKey(brand: string): BrandKey | null {
  if (brand.includes("알뜰")) return "알뜰주유소";
  return isBrandKey(brand) ? brand : null;
}

const isWon = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= DISCOUNT_LIMITS.minWon && (value as number) <= DISCOUNT_LIMITS.maxWon;

// 틀린 항목은 버리고, 같은 상표는 앞의 것만 남기고, 최대 3개.
export function cleanDiscounts(value: unknown): Discount[] {
  if (!Array.isArray(value)) return [];
  const kept: Discount[] = [];
  for (const item of value) {
    const { brand, wonPerLiter } = (item ?? {}) as Partial<Discount>;
    if (!isBrandKey(brand) || !isWon(wonPerLiter) || kept.some((discount) => discount.brand === brand)) continue;
    kept.push({ brand, wonPerLiter });
    if (kept.length === DISCOUNT_LIMITS.max) break;
  }
  return kept;
}

export function cleanBrands(value: unknown): BrandKey[] {
  if (!Array.isArray(value)) return [];
  return BRAND_KEYS.filter((key) => value.includes(key));
}

export const discountFor = (brand: string, discounts: Discount[]) =>
  discounts.find((discount) => discount.brand === brandKey(brand))?.wonPerLiter ?? 0;

export const effectivePrice = (price: number, brand: string, discounts: Discount[]) =>
  Math.max(0, price - discountFor(brand, discounts));

export function isExcluded(brand: string, excludeBrands: BrandKey[]) {
  const key = brandKey(brand);
  return key !== null && excludeBrands.includes(key);
}

// 상표를 모를 때(예상 비용) 쓰는 할인: 가장 큰 것.
export const bestDiscount = (discounts: Discount[]): Discount | null =>
  discounts.reduce<Discount | null>((best, discount) => (!best || discount.wonPerLiter > best.wonPerLiter ? discount : best), null);

// 조회 주소 조건: discounts=S-OIL:100,GS칼텍스:50 · exclude=SK에너지,E1
export function prefsQuery(prefs: Prefs): Record<string, string> {
  const query: Record<string, string> = {};
  if (prefs.discounts.length > 0) query.discounts = prefs.discounts.map((d) => `${d.brand}:${d.wonPerLiter}`).join(",");
  if (prefs.excludeBrands.length > 0) query.exclude = prefs.excludeBrands.join(",");
  return query;
}

const PREFS_ERROR = "할인은 '상표:리터당 원'(1~500원, 최대 3개), 뺀 상표는 정해진 상표 이름으로 보내 주세요.";

export function prefsFrom(params: URLSearchParams): Prefs {
  const discountText = params.get("discounts") ?? "";
  const excludeText = params.get("exclude") ?? "";
  const raw = discountText
    ? discountText.split(",").map((part) => {
        const at = part.lastIndexOf(":");
        return { brand: at < 0 ? part : part.slice(0, at), wonPerLiter: at < 0 ? NaN : Number(part.slice(at + 1)) };
      })
    : [];
  const brands = excludeText ? excludeText.split(",") : [];
  const discounts = cleanDiscounts(raw);
  const excludeBrands = cleanBrands(brands);
  if (discounts.length !== raw.length || brands.some((brand) => !isBrandKey(brand))) throw new RangeError(PREFS_ERROR);
  return { discounts, excludeBrands };
}
