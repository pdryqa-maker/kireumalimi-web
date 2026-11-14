// 실질비용 계산의 출발 위치: 울주군 읍면 행정복지센터와, 고른 지역의 시군구청(areaPlaces.ts).
// 지역도 위치도 고르지 않았으면 출발 위치는 비어 있다(NO_PLACE). 어느 지역도 가정하지 않는다.
import { AREA_PLACES, SIDO_NAMES } from "./areaPlaces";
import type { Profile } from "./profile";

// 위경도는 OpenStreetMap(2026-11-13 조회), x·y는 그것을 오피넷 반경 조회가 쓰는 KATEC 좌표로 바꾼 값이다.
// 범서읍 좌표로 반경 조회를 해 보니 같은 길의 범서주유소가 127m로 나와 변환을 확인했다.
export const PLACES: Record<string, { name: string; x: number; y: number }> = {
  eonyang: { name: "언양읍", x: 502243, y: 330555 },
  beomseo: { name: "범서읍", x: 511746, y: 330608 },
  onsan: { name: "온산읍", x: 519565, y: 315833 },
  onyang: { name: "온양읍", x: 516481, y: 314101 },
  cheongnyang: { name: "청량읍", x: 518699, y: 322315 },
  samnam: { name: "삼남읍", x: 500703, y: 327413 },
  seosaeng: { name: "서생면", x: 520717, y: 306453 },
  ungchon: { name: "웅촌면", x: 509873, y: 318663 },
  dudong: { name: "두동면", x: 508961, y: 340071 },
  duseo: { name: "두서면", x: 505414, y: 339321 },
  sangbuk: { name: "상북면", x: 499095, y: 332881 },
  samdong: { name: "삼동면", x: 505188, y: 325536 },
};

export const DEFAULT_PLACE = "eonyang";

// 고정 질문 자료(지난 고시 뒤 우리 동네는?)의 시연 지역. key는 그 자료의 지역, area는 오피넷 지역코드다.
export const DEMO_REGION = { key: "ulsan_ulju", area: "1831", name: "울주군" };

// 출발 위치 메뉴의 한 묶음(optgroup). key는 읍면 키(PLACES)나 오피넷 시군구 코드(AREA_PLACES)다.
export type PlaceGroup = { label: string; places: { key: string; name: string }[] };

export const ULJU = "1831"; // 울산 울주군. 시군구청 대신 읍면 행정복지센터로 나눠 보인다.

const ULJU_GROUP: PlaceGroup = {
  label: "울주군 읍면",
  places: Object.entries(PLACES).map(([key, place]) => ({ key, name: place.name })),
};

// 내 지역에 맞는 출발 위치 목록. 지역이 없으면 비어 있고,
// 지역(시도나 시군구)이 있으면 그 시도의 시군구청이다. 울산은 울주군을 읍면으로 나눠 함께 보인다.
export function placeGroups(area: { code: string } | null): PlaceGroup[] {
  if (!area) return [];
  const sido = area.code.slice(0, 2);
  const places = Object.entries(AREA_PLACES)
    .filter(([code]) => code.startsWith(sido) && code !== ULJU)
    .map(([key, place]) => ({ key, name: place.name }));
  if (places.length === 0) return [ULJU_GROUP];
  const group = { label: `${SIDO_NAMES[sido] ?? ""} 시군구`.trim(), places };
  return sido === ULJU.slice(0, 2) ? [group, ULJU_GROUP] : [group];
}

// 출발 위치 키 → 이름과 KATEC 좌표. 없는 키면 null.
export const placeAt = (key: string) => PLACES[key] ?? AREA_PLACES[key] ?? null;

// 챗봇에 알려 줄 출발 위치 이름: "울주군 언양읍", "대구 수성구"
export function placeTitle(key: string) {
  if (key in PLACES) return `울주군 ${PLACES[key].name}`;
  const place = AREA_PLACES[key];
  return place ? `${SIDO_NAMES[key.slice(0, 2)] ?? ""} ${place.name}`.trim() : null;
}

export const MY = "my"; // 출발 위치가 내 위치(profile.location)
export const NO_PLACE = ""; // 아직 위치를 고르지 않음

// 처음 고를 출발 위치: 내 시군구청, 시도만 정했으면 그 시도 첫 시군구, 울주군이면 언양읍, 지역이 없으면 NO_PLACE.
export function homePlace(area: { code: string } | null) {
  if (!area) return NO_PLACE;
  if (area.code === ULJU) return DEFAULT_PLACE;
  if (area.code in AREA_PLACES) return area.code;
  return placeGroups(area)[0].places[0]?.key ?? DEFAULT_PLACE;
}

// 이 지역의 메뉴에 있는 출발 위치인지
export const inPlaceMenu = (key: string, area: { code: string } | null) =>
  placeGroups(area).some((group) => group.places.some((place) => place.key === key));

// 처음 출발 위치: 내 위치가 있으면 내 위치, 없으면 내 지역의 시군구청(울주군이면 언양읍), 둘 다 없으면 NO_PLACE.
export const initialPlace = (profile: Profile) => (profile.location ? MY : homePlace(profile.area));

// 고른 출발 위치가 지금 메뉴에 있는 값인지 맞춘다(내 위치를 지우거나 지역을 바꾼 뒤 등).
export const usablePlace = (place: string, profile: Profile) =>
  place === MY
    ? profile.location
      ? MY
      : homePlace(profile.area)
    : inPlaceMenu(place, profile.area)
      ? place
      : homePlace(profile.area);

// 출발 위치 이름. 고르지 않았으면 "".
export function placeLabel(place: string, profile: Profile) {
  if (place === MY && profile.location) return profile.location.label;
  return (placeAt(place) ?? placeAt(homePlace(profile.area)))?.name ?? "";
}
