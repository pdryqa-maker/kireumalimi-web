// 숫자 대조: AI 답변 속 숫자가 도구 결과(또는 대화에 이미 나온 값)에 있는지 서버에서 확인한다.
// "숫자는 데이터에서만"을 말로만 지키지 않고 코드로 막기 위한 장치다.

// "5천", "1만"처럼 단위가 붙으면 값으로 풀어서 비교한다(5천 → 5000).
const NUMBER = /\d[\d,]*(?:\.\d+)?(?:만|천)?/g;
const UNIT: Record<string, number> = { 만: 10000, 천: 1000 };
// 줄 앞의 "1. ", "2) " 같은 목록 번호는 숫자로 세지 않는다.
const LIST_MARKER = /^\s*\d{1,2}[.)]\s/gm;
// 순서·개수에 흔히 쓰는 0~10은 근거 없이도 허용한다. 대신 '확인한 숫자' 개수에는 넣지 않는다.
const SMALL = new Set(Array.from({ length: 11 }, (_, index) => String(index)));

function normalize(raw: string) {
  const unit = UNIT[raw.at(-1) ?? ""] ?? 1;
  const plain = raw.replace(/[,만천]/g, "");
  const value = Number(plain) * unit;
  return Number.isFinite(value) ? String(value) : plain;
}

// "1,785원", "2026-11-12 09:37", "052-225-5000"을 각각 1785 / 2026, 11, 12, 9, 37 / 52, 225, 5000으로 뽑는다.
export function numbersIn(text: string) {
  return (text.replace(LIST_MARKER, "").match(NUMBER) ?? []).map(normalize);
}

// 도구 결과 같은 값에서 근거가 되는 숫자를 모은다. 배열 길이(몇 곳인지)도 근거로 친다.
export function collectAllowed(values: unknown[], into = new Set<string>(SMALL)) {
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      into.add(String(value.length));
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    } else if (typeof value === "number" || typeof value === "string") {
      numbersIn(String(value)).forEach((number) => into.add(number));
    }
  };
  values.forEach(visit);
  return into;
}

export function checkNumbers(answer: string, allowed: Set<string>) {
  const found = [...new Set(numbersIn(answer))];
  return {
    unknown: found.filter((number) => !allowed.has(number)),
    verified: found.filter((number) => allowed.has(number) && !SMALL.has(number)).length,
  };
}
