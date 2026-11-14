// 지역 목록과 현재 위치 찾기. 내 정보, 내 알림 조건, 위치 고르기 창이 함께 쓴다.
import { inKorea, toKatec } from "@/lib/katec";
import type { MyArea, MyPlace } from "@/lib/profile";

export type Area = { code: string; name: string };

// 오피넷 시도 목록, sido를 주면 그 시도의 시군구 목록
export async function loadAreas(sido = ""): Promise<Area[]> {
  const response = await fetch(`/api/areas${sido ? `?sido=${sido}` : ""}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.areas)) throw new Error(body?.error ?? "지역 목록을 불러오지 못했어요.");
  return body.areas;
}

const round100 = (value: number) => Math.round(value / 100) * 100;

function currentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000, maximumAge: 10 * 60_000 }),
  );
}

// 현재 위치로 찾기: 휴대폰 위치를 100m 단위로 줄인 KATEC 좌표로 바꾸고, 그 위치가 속한 시군구도 찾는다.
// 시군구를 못 찾으면 area는 null이다(위치만으로도 근처 조회는 된다).
export async function findMyPlace(): Promise<{ location: MyPlace; area: MyArea | null } | { error: string }> {
  if (!("geolocation" in navigator)) return { error: "이 브라우저는 위치를 알려 주지 않아요. 지역을 골라 주세요." };
  let position: GeolocationPosition;
  try {
    position = await currentPosition();
  } catch (problem) {
    const denied = (problem as GeolocationPositionError)?.code === 1; // PERMISSION_DENIED
    return {
      error: denied
        ? "위치 권한이 꺼져 있어요. 브라우저에서 위치를 허용하거나 지역을 골라 주세요."
        : "위치를 찾지 못했어요. 잠시 뒤 다시 누르거나 지역을 골라 주세요.",
    };
  }
  const { latitude, longitude } = position.coords;
  if (!inKorea(latitude, longitude)) return { error: "우리나라 밖 위치라 주유소를 찾을 수 없어요. 지역을 골라 주세요." };
  const katec = toKatec(latitude, longitude);
  const location: MyPlace = { label: "현재 위치", x: round100(katec.x), y: round100(katec.y) };
  const response = await fetch(`/api/areas/locate?x=${location.x}&y=${location.y}`).catch(() => null);
  const body = await response?.json().catch(() => null);
  return { location, area: response?.ok && body?.area ? body.area : null };
}
