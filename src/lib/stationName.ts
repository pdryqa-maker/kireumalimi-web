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

// 오피넷 이름 찾기에 넣을 말: 회사 표시와 끝의 '주유소'만 떼고 띄어쓰기는 남긴다. "㈜이림 언양주유소" → "이림 언양"
export const searchName = (name: string) =>
  name.replace(COMPANY, "").replace(/\s*주유소$/, "").replace(/\s+/g, " ").trim();
