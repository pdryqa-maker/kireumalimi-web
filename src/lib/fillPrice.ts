// 금액(5만원어치)을 리터로 바꿀 때 쓰는 가격: 오늘 전국 평균 판매가(오피넷 avgAllPrice).
// 오늘의 기름 소식과 같은 조회라 1시간 동안 함께 재사용한다. 못 받으면 null을 돌려주고, 쓰는 쪽이 금액 없이 답한다.
import { DEFAULT_FULL_LITERS, fillRequestFrom, litersFill, makeFill, type Fill, type FillRequest, type Price } from "./fillAmount";
import { fetchOpinetTimed, OpinetError } from "./opinet";
import { FUEL_CODES, rows } from "./stations";

const AVERAGE_CACHE_MS = 60 * 60 * 1000;

export async function nationalPrice(fuel: string): Promise<Price | null> {
  const prodcd = FUEL_CODES[fuel];
  if (!prodcd) return null;
  try {
    const { body } = await fetchOpinetTimed("avgAllPrice", {}, AVERAGE_CACHE_MS);
    const price = Number(rows(body).find((row) => String(row.PRODCD) === prodcd)?.PRICE);
    if (!(price > 0)) return null;
    const name = fuel === "자동차부탄" ? "LPG" : fuel;
    return { pricePerLiter: Math.round(price), basis: `오늘 전국 평균 ${name} 판매가(오피넷)` };
  } catch (error) {
    if (error instanceof OpinetError) return null;
    throw error;
  }
}

// 리터로 말한 주유량은 그대로, 금액은 전국 평균가로, 가득은 받은 리터로. 금액인데 가격을 못 받으면 null.
export async function resolveFill(fuel: string, request: FillRequest): Promise<Fill | null> {
  if ("liters" in request) return litersFill(request.liters);
  if (request.amount === "full") return makeFill("full", request.full, null);
  return makeFill(request.amount, request.full, await nationalPrice(fuel));
}

export const AMOUNT_ERROR = "주유 금액은 5천~30만원(천원 단위)이나 가득이어야 합니다.";

// 서버 경로용: 주유량 값이 없으면 기본(가득 40L가 아니라 예전처럼 40L), 값이 틀리면 RangeError.
export function fillRequestOrDefault(params: URLSearchParams): FillRequest {
  const request = fillRequestFrom(params);
  if (request) return request;
  if (params.has("amount") || params.has("liters")) throw new RangeError(AMOUNT_ERROR);
  return { liters: DEFAULT_FULL_LITERS };
}
