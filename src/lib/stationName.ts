// 주유소 이름 맞추기. 영수증 이름과 오피넷 이름은 회사 표시·띄어쓰기가 달라도 같은 곳일 수 있다.
// 브라우저(단골 셈)와 서버(주유소 점검)가 함께 쓴다.
const COMPANY = /\(주\)|㈜|주식회사|\(유\)|유한회사|\(합\)/g;

// 회사 표시와 띄어쓰기, 끝의 '주유소'를 뺀 이름
export const coreName = (name: string) => name.replace(COMPANY, "").replace(/\s+/g, "").replace(/주유소$/, "");

// 한쪽이 다른 쪽을 품으면 같은 주유소로 본다.
export function sameStation(receiptName: string, stationName: string) {
  const a = coreName(receiptName);
  const b = coreName(stationName);
  return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
}

// 오피넷 이름 찾기에 넣을 말들: 회사 표시에서 나눈 조각마다 끝의 '주유소'를 떼고, 두 글자 이상인 조각을 긴 것부터.
// 오피넷은 이름 일부로 찾으므로 검색어가 오피넷 이름에 그대로 들어 있어야 한다. 가운데 회사 표시를 빼고 붙이면
// "대양석유(주)해룡주유소" → "대양석유해룡"처럼 오피넷 이름에 없는 말이 되어 못 찾는다. 그래서 조각으로 나눈다.
// "㈜이림 언양주유소" → ["이림 언양"], "대양석유(주)해룡주유소" → ["대양석유", "해룡"]
export const searchNames = (name: string) =>
  name
    .split(COMPANY)
    .map((part) => part.replace(/\s*주유소\s*$/, "").replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 2)
    .sort((a, b) => b.length - a.length);
