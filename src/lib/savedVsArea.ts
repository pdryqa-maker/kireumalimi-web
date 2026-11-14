// 달별 시도 평균 비교 결과(내 기록 "시도 평균보다" 줄, 올해 아낀 돈). 이 브라우저에만 남긴다.
// 다 견준 지난 달은 계속 남긴다(vsAreaFinal). 이번 달은 다 견줬을 때 그날 하루만 쓴다(provisionalOn).
import { browserStore } from "./browserStore";

export type VsArea = { fingerprint: string; area: string; savedWon: number; comparedFills: number; provisionalOn?: string };

export const vsAreaStore = browserStore("kireumalimi.vsArea", "{}");

export const parseVsArea = (raw: string): Record<string, VsArea> => {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};
