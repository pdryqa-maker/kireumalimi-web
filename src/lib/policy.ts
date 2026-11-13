// 정부가 발표한 연료 제도 값. 오피넷 API에 없는 값이라 발표를 확인해 직접 적는다.
// 발표가 바뀌면 이 파일만 고친다. checkedOn은 마지막으로 발표를 확인한 날이다.

export const FUEL_TAX_CUT = {
  name: "유류세 인하",
  decidedOn: "2026-11-11",
  endsOn: "2027-01-31",
  source: "재정경제부 발표(2026-11-11 비상경제장관회의)",
  checkedOn: "2026-11-13",
  // 부가가치세를 포함한 리터당 인하액. 인하가 끝나면 세금이 이만큼 다시 붙는다.
  fuels: {
    휘발유: { ratePct: 15, wonPerLiter: 122 },
    경유: { ratePct: 25, wonPerLiter: 145 },
    자동차부탄: { ratePct: 25, wonPerLiter: 51 },
  } as Record<string, { ratePct: number; wonPerLiter: number }>,
};

export const MAX_LITERS = 300;

// 유류세 인하가 끝날 때 내 주유량에서 최대 얼마가 더 드는지. 판매가가 한 번에 오르지 않을 수 있어 '최대'다.
export function taxCutImpact(fuel: string, liters: number) {
  const cut = FUEL_TAX_CUT.fuels[fuel];
  if (!cut) {
    return { error: `${fuel}는 유류세 인하 계산 대상이 아닙니다. 휘발유, 경유, 자동차부탄만 계산합니다.` };
  }
  if (!Number.isInteger(liters) || liters < 1 || liters > MAX_LITERS) {
    throw new RangeError(`주유량은 1~${MAX_LITERS}리터 사이 정수여야 합니다.`);
  }
  return {
    fuel,
    liters,
    ratePct: cut.ratePct,
    wonPerLiter: cut.wonPerLiter,
    maxExtraWon: cut.wonPerLiter * liters,
    endsOn: FUEL_TAX_CUT.endsOn,
    decidedOn: FUEL_TAX_CUT.decidedOn,
    source: FUEL_TAX_CUT.source,
    note: "인하가 끝나도 판매가가 한 번에 오르지 않을 수 있어 최대값입니다. 정부가 다시 연장하면 바뀝니다.",
  };
}
