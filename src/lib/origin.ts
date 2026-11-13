// 조회 주소의 출발 위치: place=읍면 키, 또는 x·y·label(이용자 위치).
import { DEFAULT_PLACE } from "./places";
import { cleanText, isKatec, LIMITS } from "./profile";
import type { Origin } from "./stations";

export function originFrom(params: URLSearchParams): Origin {
  if (params.has("x") || params.has("y")) {
    const x = Number(params.get("x"));
    const y = Number(params.get("y"));
    if (!isKatec(x, y)) throw new RangeError("위치 좌표가 우리나라 범위를 벗어났습니다.");
    return { name: cleanText(params.get("label"), LIMITS.label) || "내 위치", x: Math.round(x), y: Math.round(y) };
  }
  return params.get("place") ?? DEFAULT_PLACE;
}
