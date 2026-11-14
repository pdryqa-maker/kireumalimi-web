// 휴대폰 위치(위경도, WGS84)를 오피넷 반경 조회가 쓰는 KATEC 좌표로 바꾼다.
// KATEC: 베셀 타원체 TM, 원점 북위 38도·동경 128도, 가산값 x 400000 y 600000, 축척 0.9999.
import proj4 from "proj4";

const KATEC =
  "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs " +
  "+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43";

// 우리나라(제주, 울릉·독도 포함)를 넉넉히 감싸는 범위. 이 밖이면 오피넷에 물을 수 없다.
export const KOREA = { minLat: 33, maxLat: 38.7, minLon: 124.5, maxLon: 132 };

export function inKorea(lat: number, lon: number) {
  return lat >= KOREA.minLat && lat <= KOREA.maxLat && lon >= KOREA.minLon && lon <= KOREA.maxLon;
}

export function toKatec(lat: number, lon: number) {
  const [x, y] = proj4("WGS84", KATEC, [lon, lat]);
  return { x: Math.round(x), y: Math.round(y) };
}

// 오피넷 KATEC 좌표를 지도에 찍을 위경도(WGS84)로 바꾼다.
export function fromKatec(x: number, y: number) {
  const [lon, lat] = proj4(KATEC, "WGS84", [x, y]);
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}
