// 카카오맵 길찾기 주소. 출발 위치까지 넣으면 카카오맵이 출발지를 채운 채로 길찾기를 연다(자동차 경로가 바로 보임).
// 모양: https://map.kakao.com/link/from/이름,위도,경도/to/이름,위도,경도 (출발 위치가 없으면 /link/to/만)
export type Spot = { name: string; lat: number; lon: number };

const coord = (value: number) => String(Number(value.toFixed(6)));
// 이름의 쉼표·빗금은 주소의 구분 기호와 겹치므로 띄어쓰기로 바꾼다.
const part = ({ name, lat, lon }: Spot) =>
  `${encodeURIComponent(name.replace(/[,/]/g, " ").replace(/\s+/g, " ").trim())},${coord(lat)},${coord(lon)}`;

export const kakaoDirections = (to: Spot, from: Spot | null) =>
  from ? `https://map.kakao.com/link/from/${part(from)}/to/${part(to)}` : `https://map.kakao.com/link/to/${part(to)}`;
