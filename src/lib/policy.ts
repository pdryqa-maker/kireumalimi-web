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

// 석유 최고가격 고시. 정해진 종료일이 없어 미리 알리지 않고, 발표 직후 해설로 보여 준다.
// 새 차수가 발표되면 rounds 끝에 추가한다. 가장 마지막 차수와 그 앞 차수를 비교한다.
export const PRICE_CAP = {
  name: "석유 최고가격",
  meaning: "정유사가 주유소와 판매소에 넘기는 공급가의 상한입니다. 주유소 판매가의 상한은 아닙니다.",
  checkedOn: "2026-11-13",
  // 지금 상한 값이 처음 정해진 고시(리터당 150원 인하). 8차부터는 이 값으로 계속 동결됐다. 출처: 팀 과거 기록(fixed_question.json 7차).
  setBy: { round: 7, startsOn: "2026-06-27", prices: { 휘발유: 1784, 경유: 1773, 실내등유: 1380 } as Record<string, number> },
  rounds: [
    {
      round: 11,
      announcedOn: "2026-10-16",
      startsOn: "2026-10-17",
      prices: { 휘발유: 1784, 경유: 1773, 실내등유: 1380 } as Record<string, number>,
      source: "산업통상부 11차 석유 최고가격 고시",
    },
    {
      round: 12,
      announcedOn: "2026-11-13",
      startsOn: "2026-11-14",
      // 11차와 같은 값으로 동결(8차부터 다섯 번째 연속 동결). 적용 기간은 11월 14일 0시부터 4주.
      prices: { 휘발유: 1784, 경유: 1773, 실내등유: 1380 } as Record<string, number>,
      source: "산업통상부 12차 석유 최고가격 고시",
    },
  ],
};

export const CAP_FUELS = ["휘발유", "경유", "실내등유"];

export const MAX_LITERS = 300;

const checkLiters = (liters: number | null) => {
  if (liters !== null && (!Number.isInteger(liters) || liters < 1 || liters > MAX_LITERS)) {
    throw new RangeError(`주유량은 1~${MAX_LITERS}리터 사이 정수여야 합니다.`);
  }
};

// 최근 고시의 최고가격과 직전 차수 대비 변화. 공급가 상한이라 판매가가 같은 폭으로 바로 움직인다는 보장은 없다.
// 주유량(liters)을 모르면(금액을 리터로 바꿀 평균가를 못 받았을 때) 리터당 값만 돌려준다.
export function priceCapNotice(fuel: string, liters: number | null) {
  const current = PRICE_CAP.rounds.at(-1)!;
  const previous = PRICE_CAP.rounds.at(-2) ?? null;
  if (!(fuel in current.prices)) {
    return { error: `최고가격 안내 대상 유종이 아닙니다(${fuel}). 휘발유, 경유, 실내등유만 안내합니다.` };
  }
  checkLiters(liters);
  const fuels = CAP_FUELS.map((name) => {
    const capWon = current.prices[name];
    const previousCapWon = previous?.prices[name] ?? null;
    return { fuel: name, capWon, previousCapWon, changeWon: previousCapWon === null ? null : capWon - previousCapWon };
  });
  const chosen = fuels.find((item) => item.fuel === fuel)!;
  return {
    round: current.round,
    announcedOn: current.announcedOn,
    startsOn: current.startsOn,
    previousRound: previous?.round ?? null,
    fuel,
    liters,
    capWon: chosen.capWon,
    changeWon: chosen.changeWon,
    // 상한 변화가 주유량만큼 판매가에 다 옮겨 갈 때의 차이. 그보다 작거나 늦을 수 있어 '최대'다.
    maxDiffWon: chosen.changeWon === null || liters === null ? null : Math.abs(chosen.changeWon) * liters,
    fuels,
    meaning: PRICE_CAP.meaning,
    source: current.source,
    checkedOn: PRICE_CAP.checkedOn,
    note: "주유소 판매가에 언제 얼마나 반영될지는 주유소마다 다릅니다. 앞으로의 판매가를 예측한 값이 아닙니다.",
  };
}

// 유류세 인하가 끝날 때 내 주유량에서 최대 얼마가 더 드는지. 판매가가 한 번에 오르지 않을 수 있어 '최대'다.
export function taxCutImpact(fuel: string, liters: number | null) {
  const cut = FUEL_TAX_CUT.fuels[fuel];
  if (!cut) {
    return { error: `유류세 인하 계산 대상 유종이 아닙니다(${fuel}). 휘발유, 경유, 자동차부탄만 계산합니다.` };
  }
  checkLiters(liters);
  return {
    fuel,
    liters,
    ratePct: cut.ratePct,
    wonPerLiter: cut.wonPerLiter,
    maxExtraWon: liters === null ? null : cut.wonPerLiter * liters,
    endsOn: FUEL_TAX_CUT.endsOn,
    decidedOn: FUEL_TAX_CUT.decidedOn,
    source: FUEL_TAX_CUT.source,
    note: "인하가 끝나도 판매가가 한 번에 오르지 않을 수 있어 최대값입니다. 정부가 다시 연장하면 바뀝니다.",
  };
}
