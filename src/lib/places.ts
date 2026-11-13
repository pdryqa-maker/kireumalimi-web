// 실질비용 계산의 출발 위치: 울주군 읍면 행정복지센터.
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

// 시연 지역. 로그인하지 않은 이용자의 기본 지역이다. key는 고정 질문 데이터의 지역, area는 오피넷 지역코드다.
export const DEMO_REGION = { key: "ulsan_ulju", area: "1831", name: "울주군" };
