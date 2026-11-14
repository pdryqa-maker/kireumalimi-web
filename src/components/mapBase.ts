// 지도 공통 설정: 지도 탭(StationMap)과 챗봇 답의 작은 지도(StationMiniMap)가 함께 쓴다.
// 바탕 지도는 키 없이 쓰는 OpenFreeMap(OpenStreetMap 자료), 지도 그리기는 MapLibre.
import type { Map as MapLibreMap } from "maplibre-gl";

export const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
// MapLibre v6 워커. 설치 때 public/maplibre/로 복사해 둔다(scripts/copy-maplibre-worker.mjs).
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

export type MapLib = typeof import("maplibre-gl");

export async function loadMapLib(): Promise<MapLib> {
  const lib = await import("maplibre-gl");
  lib.setWorkerUrl(WORKER_URL);
  return lib;
}

// 바탕 지도 손보기('load' 뒤에 부른다): 지명은 한국어 이름 먼저, 도로 번호 표지는 숨김, 출처 표시는 'i' 단추로 접어 둠.
// 표지 층은 네모 그림 위에 도로 번호를 쓰는데, 국내 도로는 번호가 비어 있는 곳이 많아 빈 네모만 남는다.
export function tidyBaseMap(map: MapLibreMap) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol") continue;
    const field = JSON.stringify(map.getLayoutProperty(layer.id, "text-field") ?? "");
    if (field.includes("ref")) {
      map.setLayoutProperty(layer.id, "visibility", "none");
    } else if (field.includes("name")) {
      map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:ko"], ["get", "name"]]);
    }
  }
  map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
}

// 가격 표시 하나: 바깥 칸(root)은 MapLibre가 transform으로 위치를 옮기고, 안쪽 버튼에만 모양과 확대 효과를 준다.
// 바깥 칸에 transition이 붙으면 지도를 움직일 때 위치 이동까지 늦게 따라와 숫자가 미끄러진다.
export function markerElement(onClick: () => void) {
  const root = document.createElement("div");
  const button = document.createElement("button");
  button.type = "button";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  root.appendChild(button);
  return { root, button };
}

// 출발 위치 점
export function originElement(name: string) {
  const pin = document.createElement("div");
  pin.setAttribute("aria-label", `출발 위치 ${name}`);
  pin.innerHTML = '<span class="block size-4 rounded-full border-[3px] border-white bg-flame shadow-raised"></span>';
  return pin;
}

export const PILL =
  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold tabular-nums whitespace-nowrap transition-transform";
