"use client";

// 지도 탭: 출발 위치 반경 5km 주유소를 지도 위 가격 표시로 보여 준다. 가까이 모인 곳은 '몇 곳 · 가격대' 원으로 묶는다.
// 바탕 지도는 키 없이 쓰는 OpenFreeMap(OpenStreetMap 자료), 지도 그리기는 MapLibre. 주유소 자료는 오피넷 반경 조회(/api/stations/map).
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { amountQuery, type Amount } from "@/lib/fillAmount";
import { prefsQuery } from "@/lib/discounts";
import { DEFAULT_PLACE, initialPlace, MY, NO_PLACE, usablePlace } from "@/lib/places";
import { fuelName, prefsOf } from "@/lib/profile";
import { ConditionBar } from "./ConditionBar";
import { openLocationPicker } from "./LocationPicker";
import { basis, PUMP_NOTE, won } from "./format";
import { useFullLiters } from "./useFill";
import { useProfile } from "./useStored";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const RADIUS_KM = 5;

type MapStation = {
  id: string;
  name: string;
  brand: string;
  price: number;
  paidPrice: number;
  discountWon: number;
  distanceKm: number;
  lat: number;
  lon: number;
  fillWon: number;
  tripWon: number;
  totalWon: number;
};
type MapData = {
  place: string;
  origin: { lat: number; lon: number };
  fill: { label: string };
  kmpl: number;
  fetchedAtKst: string;
  distanceNote: string;
  excludedCount: number;
  cheapestId: string | null;
  bestTotalId: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  stations: MapStation[];
};
type Detail = { prices: { fuel: string; price: number; updatedAt: string | null }[] };

// 출발 위치를 가운데로 하는 반경 원(지도에 옅게 그린다).
function radiusRing(lat: number, lon: number, km: number) {
  const points = Array.from({ length: 65 }, (_, index) => {
    const angle = (index / 64) * 2 * Math.PI;
    const dLat = (km / 111.32) * Math.sin(angle);
    const dLon = (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(angle);
    return [lon + dLon, lat + dLat];
  });
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [points] } };
}

const PILL = "flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold tabular-nums whitespace-nowrap transition-transform";

// 표시 하나: 바깥 칸(root)은 MapLibre가 transform으로 위치를 옮기고, 안쪽 버튼에만 모양과 확대 효과를 준다.
// 바깥 칸에 transition이 붙으면 지도를 움직일 때 위치 이동까지 늦게 따라와 숫자가 미끄러진다.
function markerElement(onClick: () => void) {
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

// 내용이 바뀔 때만 다시 쓴다(그릴 때마다 innerHTML을 바꾸면 깜빡인다).
function paint(button: HTMLButtonElement, view: string, className: string, html: string, label: string) {
  if (button.dataset.view === view) return;
  button.dataset.view = view;
  button.className = className;
  button.innerHTML = html;
  button.setAttribute("aria-label", label);
}

export default function StationMap() {
  const profile = useProfile();
  const fullTank = useFullLiters(profile.fullLiters);
  const [fuelChoice, setFuel] = useState<string | null>(null);
  const [placeChoice, setPlace] = useState<string | null>(null);
  const [amountChoice, setAmount] = useState<Amount | null>(null);
  const fuel = fuelChoice ?? profile.fuel;
  const amount = amountChoice ?? profile.amount;
  const place = usablePlace(placeChoice ?? initialPlace(profile), profile);

  const [data, setData] = useState<MapData | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: string; body: Detail | null } | null>(null);
  const [reload, setReload] = useState(0);
  const [collapsed, setCollapsed] = useState(false); // 휴대폰에서 주유소 카드를 접었는지(다른 주유소를 골라도 그대로 둔다)

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, { marker: Marker; element: HTMLButtonElement }>());
  const originMarkerRef = useRef<Marker | null>(null);
  const selectRef = useRef(setSelectedId);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);

  // 조회 질의: 거리까지 고려한 추천과 같은 값(유종, 출발 위치, 금액, 연비, 할인·뺀 상표)
  const query = (() => {
    if (place === NO_PLACE) return null;
    const origin: Record<string, string> =
      place === MY && profile.location
        ? { x: String(profile.location.x), y: String(profile.location.y), label: profile.location.label }
        : { place: place === MY ? DEFAULT_PLACE : place };
    return new URLSearchParams({
      fuel,
      ...origin,
      ...amountQuery(amount, fullTank),
      kmpl: String(profile.kmpl),
      ...prefsQuery(prefsOf(profile)),
    }).toString();
  })();

  // 지도 만들기(한 번)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lib = await import("maplibre-gl");
      const { Map, NavigationControl, setWorkerUrl } = lib;
      if (cancelled || !containerRef.current) return;
      libRef.current = lib;
      // 워커 파일은 설치 때 public/maplibre/로 복사해 둔다(scripts/copy-maplibre-worker.mjs).
      setWorkerUrl(WORKER_URL);
      const map = new Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: [129.1258, 35.5693],
        zoom: 12,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
      map.on("load", () => {
        // 지명은 한국어 이름을 먼저 쓴다(없으면 원래 이름). 도로 번호 표지(ref) 층은 숨긴다.
        // 표지 층은 네모 그림 위에 도로 번호를 쓰는데, 국내 도로는 번호가 비어 있는 곳이 많아 빈 네모만 남는다.
        for (const layer of map.getStyle().layers ?? []) {
          if (layer.type !== "symbol") continue;
          const field = JSON.stringify(map.getLayoutProperty(layer.id, "text-field") ?? "");
          if (field.includes("ref")) {
            map.setLayoutProperty(layer.id, "visibility", "none");
          } else if (field.includes("name")) {
            map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:ko"], ["get", "name"]]);
          }
        }
        map.addSource("radius", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": "#15171c", "fill-opacity": 0.035 } });
        map.addLayer({
          id: "radius-line",
          type: "line",
          source: "radius",
          paint: { "line-color": "#15171c", "line-opacity": 0.25, "line-width": 1, "line-dasharray": [2, 2] },
        });
        map.addSource("stations", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterRadius: 46,
          clusterMaxZoom: 15,
          clusterProperties: {
            minPrice: ["min", ["get", "paidPrice"]],
            maxPrice: ["max", ["get", "paidPrice"]],
          },
        });
        // 보이지 않는 점 층: 묶음과 낱개를 읽어 HTML 표시를 그리기 위해 둔다.
        map.addLayer({ id: "stations-hit", type: "circle", source: "stations", paint: { "circle-radius": 1, "circle-opacity": 0 } });
        map.on("click", () => selectRef.current(null));
        // 출처 표시는 처음부터 펼쳐져 가격 표시를 가리므로 'i' 단추로 접어 둔다(누르면 다시 보인다).
        map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        // 화면이 다시 붙으며 지도가 새로 만들어졌다면 옛 지도의 준비 완료는 무시한다.
        if (mapRef.current === map) setMapReady(true);
      });
      mapRef.current = map;
    })();
    const markers = markersRef.current;
    return () => {
      cancelled = true;
      // 새 지도는 'load' 뒤에야 층과 자료 칸이 생기므로, 그 전까지는 준비 안 됨으로 둔다.
      setMapReady(false);
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // 자료 받기
  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    (async () => {
      setState("loading");
      try {
        const response = await fetch(`/api/stations/map?${query}`);
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !body?.stations) {
          setError(body?.error ?? "주유소를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.");
          setState("error");
          return;
        }
        setData(body);
        setSelectedId(body.bestTotalId);
        setDetail(null);
        setState("idle");
      } catch {
        if (!cancelled) {
          setError("주유소를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  // 자료를 지도에 올리기
  useEffect(() => {
    const map = mapRef.current;
    const radius = map?.getSource("radius") as GeoJSONSource | undefined;
    const points = map?.getSource("stations") as GeoJSONSource | undefined;
    if (!map || !mapReady || !data || !radius || !points) return;
    radius.setData({
      type: "FeatureCollection",
      features: [radiusRing(data.origin.lat, data.origin.lon, RADIUS_KM)],
    });
    points.setData({
      type: "FeatureCollection",
      features: data.stations.map((station) => ({
        type: "Feature",
        properties: { id: station.id, paidPrice: station.paidPrice },
        geometry: { type: "Point", coordinates: [station.lon, station.lat] },
      })),
    });

    let cancelled = false;
    (async () => {
      const { Marker, LngLatBounds } = await import("maplibre-gl");
      if (cancelled) return;
      originMarkerRef.current?.remove();
      const pin = document.createElement("div");
      pin.className = "grid place-items-center";
      pin.setAttribute("aria-label", `출발 위치 ${data.place}`);
      pin.innerHTML =
        '<span class="block size-4 rounded-full border-[3px] border-white bg-flame shadow-raised"></span>';
      originMarkerRef.current = new Marker({ element: pin }).setLngLat([data.origin.lon, data.origin.lat]).addTo(map);

      const bounds = new LngLatBounds([data.origin.lon, data.origin.lat], [data.origin.lon, data.origin.lat]);
      for (const station of data.stations) bounds.extend([station.lon, station.lat]);
      // 위는 조건 줄, 아래는 주유소 카드(휴대폰은 아래 탭까지)가 덮으므로 실제로 덮는 높이만큼 비우고 맞춘다.
      // 비울 칸이 너무 커서 지도가 남지 않으면 MapLibre가 맞추기를 건너뛰므로, 지도 높이의 60%까지만 비운다.
      const box = map.getContainer().getBoundingClientRect();
      const topCover = topRef.current ? topRef.current.getBoundingClientRect().bottom - box.top + 16 : 140;
      const bottomCover = bottomRef.current ? box.bottom - bottomRef.current.getBoundingClientRect().top + 16 : 300;
      const room = box.height * 0.6;
      const scale = topCover + bottomCover > room ? room / (topCover + bottomCover) : 1;
      map.fitBounds(bounds, {
        padding: { top: Math.round(topCover * scale), bottom: Math.round(bottomCover * scale), left: 40, right: 40 },
        maxZoom: 14,
        duration: 0, // 처음 맞추기는 바로 옮긴다(애니메이션은 탭이 가려져 있으면 멈춰 엉뚱한 화면에 남을 수 있다)
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [data, mapReady]);

  // 묶음·낱개 가격 표시를 지도 상태에 맞춰 다시 그린다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !data) return;
    const byId = Object.fromEntries(data.stations.map((station) => [station.id, station]));
    const markers = markersRef.current;
    let frame = 0;

    const draw = () => {
      const Marker = libRef.current?.Marker;
      if (!Marker || !map.getLayer("stations-hit")) return; // 지도가 새로 만들어지는 중이면 다음 그리기에서 한다
      const seen = new Set<string>();
      // 지금 확대 단계에서 그려진 것만 읽는다(querySourceFeatures는 확대 중 위·아래 단계 타일을 함께 돌려줘 묶음과 낱개가 겹친다).
      for (const feature of map.queryRenderedFeatures({ layers: ["stations-hit"] })) {
        const props = feature.properties ?? {};
        const [lon, lat] = (feature.geometry as GeoJSON.Point).coordinates;
        const key = props.cluster ? `c${props.cluster_id}` : String(props.id);
        if (seen.has(key)) continue;
        seen.add(key);
        let entry = markers.get(key);
        if (!entry) {
          const clusterId = Number(props.cluster_id);
          const { root, button } = markerElement(() => {
            if (props.cluster) {
              (map.getSource("stations") as GeoJSONSource)
                .getClusterExpansionZoom(clusterId)
                .then((zoom) => map.easeTo({ center: [lon, lat], zoom: zoom + 0.3 }));
            } else {
              selectRef.current(String(props.id));
            }
          });
          entry = { marker: new Marker({ element: root }).setLngLat([lon, lat]).addTo(map), element: button };
          markers.set(key, entry);
        }
        const { element } = entry;
        if (props.cluster) {
          const range =
            props.minPrice === props.maxPrice ? won(props.minPrice) : `${won(props.minPrice)}~${won(props.maxPrice)}`;
          paint(
            element,
            `c${props.point_count}-${range}`,
            "grid size-[4.5rem] place-content-center rounded-full bg-ground/90 text-center shadow-raised backdrop-blur-sm transition-transform hover:scale-105",
            `<span class="text-base font-bold leading-tight tabular-nums">${props.point_count}곳</span><span class="text-[11px] leading-tight text-ink-soft tabular-nums">${range}</span>`,
            `주유소 ${props.point_count}곳, ${range}원. 눌러서 확대`,
          );
        } else {
          const station = byId[String(props.id)];
          if (!station) continue;
          const selected = station.id === selectedId;
          const cheapest = station.id === data.cheapestId;
          paint(
            element,
            `s${selected}-${cheapest}-${station.paidPrice}`,
            `${PILL} ${selected ? "scale-110 bg-ink text-on-accent shadow-raised" : "bg-ground text-ink shadow-raised-sm hover:scale-105"}`,
            `${cheapest ? `<span class="text-[10px] font-semibold ${selected ? "text-on-accent/80" : "text-ink-soft"}">최저</span>` : ""}${won(station.paidPrice)}`,
            `${station.name} ${won(station.paidPrice)}원${cheapest ? ", 가장 싼 곳" : ""}`,
          );
          element.setAttribute("aria-pressed", String(selected));
          entry.marker.getElement().style.zIndex = selected ? "3" : cheapest ? "2" : "1";
        }
      }
      // 고른 주유소가 묶음 안에 들어가 있어도 가격 표시는 따로 보이게 한다.
      const chosen = selectedId ? byId[selectedId] : undefined;
      if (chosen && !seen.has(chosen.id)) {
        seen.add(chosen.id);
        let entry = markers.get(chosen.id);
        if (!entry) {
          const { root, button } = markerElement(() => selectRef.current(chosen.id));
          entry = { marker: new Marker({ element: root }).setLngLat([chosen.lon, chosen.lat]).addTo(map), element: button };
          markers.set(chosen.id, entry);
        }
        paint(
          entry.element,
          `s-chosen-${chosen.paidPrice}`,
          `${PILL} scale-110 bg-ink text-on-accent shadow-raised`,
          won(chosen.paidPrice),
          `${chosen.name} ${won(chosen.paidPrice)}원`,
        );
        entry.element.setAttribute("aria-pressed", "true");
        entry.marker.getElement().style.zIndex = "3";
      }
      for (const [key, entry] of markers) {
        if (!seen.has(key)) {
          entry.marker.remove();
          markers.delete(key);
        }
      }
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    map.on("render", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      map.off("render", schedule);
    };
  }, [data, mapReady, selectedId]);

  // 바뀐 데이터나 위치에서는 이전 표시를 모두 지운다.
  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const entry of markers.values()) entry.marker.remove();
      markers.clear();
    };
  }, [data]);

  useEffect(() => {
    selectRef.current = (id) => {
      setSelectedId(id);
      setDetail(null);
    };
  }, []);

  const selected = data?.stations.find((station) => station.id === selectedId) ?? null;

  async function loadDetail(station: MapStation) {
    setDetail({ id: station.id, body: null });
    const response = await fetch(`/api/stations/${station.id}`).catch(() => null);
    const body = response?.ok ? await response.json().catch(() => null) : null;
    setDetail({ id: station.id, body: body ?? { prices: [] } });
  }

  const fuelText = fuelName(fuel);
  const myPrice = selected && detail?.id === selected.id ? detail.body?.prices.find((item) => item.fuel === fuel) : undefined;

  return (
    <section data-map aria-label="주유소 지도" className="relative h-[calc(100dvh-3.5rem)] overflow-hidden">
      {/* MapLibre가 지도 칸에 position: relative를 주므로, 위치는 바깥 칸이 잡는다. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      <div ref={topRef} className="pointer-events-none absolute inset-x-3 top-3 z-10 mx-auto max-w-2xl space-y-2">
        <div className="pointer-events-auto rounded-2xl bg-ground/95 p-2 shadow-raised backdrop-blur">
          <ConditionBar fuel={fuel} place={place} amount={amount} onFuel={setFuel} onPlace={setPlace} onAmount={setAmount} />
        </div>
        {data && state !== "error" && (
          <p className="pointer-events-auto w-fit rounded-full bg-ground/95 px-3 py-1.5 text-xs font-medium text-ink-soft shadow-raised-sm backdrop-blur tabular-nums">
            {data.place} 반경 {RADIUS_KM}km · {fuelText} {data.stations.length}곳
            {data.minPrice !== null && ` · ${won(data.minPrice)}~${won(data.maxPrice ?? data.minPrice)}원`} · {data.fetchedAtKst.slice(11)} 조회
          </p>
        )}
      </div>

      <div ref={bottomRef} className="pointer-events-none absolute inset-x-3 bottom-28 z-10 mx-auto max-w-md lg:bottom-5">
        {place === NO_PLACE ? (
          <div className="pointer-events-auto rounded-3xl bg-ground p-5 shadow-raised">
            <p className="font-semibold">출발 위치를 골라 주세요</p>
            <p className="mt-1 text-sm text-ink-soft">고른 위치 반경 5km 주유소를 지도에 가격으로 보여 드려요.</p>
            <button
              type="button"
              onClick={() => openLocationPicker((next) => setPlace(initialPlace(next)))}
              className="mt-4 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
            >
              위치 고르기
            </button>
          </div>
        ) : state === "error" ? (
          <div className="pointer-events-auto flex items-center gap-3 rounded-3xl bg-ground p-4 shadow-raised">
            <p className="flex-1 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => setReload((count) => count + 1)}
              className="rounded-full px-4 py-2 text-sm font-semibold shadow-raised-sm"
            >
              다시 시도
            </button>
          </div>
        ) : state === "loading" && !data ? (
          <div role="status" className="pointer-events-auto space-y-3 rounded-3xl bg-ground p-5 shadow-raised">
            <span className="sr-only">주유소를 불러오고 있어요</span>
            <div aria-hidden="true" className="groove h-4 w-2/5" />
            <div aria-hidden="true" className="groove h-7 w-1/3" />
            <div aria-hidden="true" className="groove h-3 w-4/5" />
          </div>
        ) : data && data.stations.length === 0 ? (
          <div className="pointer-events-auto rounded-3xl bg-ground p-5 shadow-raised">
            <p className="font-semibold">반경 {RADIUS_KM}km 안에 {fuelText} 주유소가 없어요</p>
            <p className="mt-1 text-sm text-ink-soft">출발 위치를 바꿔 보세요.</p>
          </div>
        ) : selected && data ? (
          <article
            className={`pointer-events-auto animate-rise rounded-3xl bg-ground shadow-raised lg:p-5 ${collapsed ? "px-4 py-3" : "p-5"}`}
            aria-live="polite"
          >
            {/* 휴대폰: 카드를 접으면 이름·가격·총비용 한 줄만 남겨 지도를 넓게 본다. 넓은 화면은 늘 펼친다. */}
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={!collapsed}
              aria-controls="map-station-detail"
              aria-label={collapsed ? `${selected.name} 카드 펼치기` : "카드 접기"}
              className={`flex w-full items-center gap-3 text-left lg:hidden ${collapsed ? "" : "-mt-2 mb-1 justify-end"}`}
            >
              {collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{selected.name}</span>
                    <span className="block text-xs text-ink-soft tabular-nums">
                      직선 {selected.distanceKm}km · 총 {won(selected.totalWon)}원
                    </span>
                  </span>
                  <span className="shrink-0 text-xl font-bold tabular-nums">
                    {won(selected.paidPrice)}
                    <span className="ml-0.5 text-sm font-medium">원</span>
                  </span>
                </>
              )}
              <span className={`grid size-8 shrink-0 place-items-center rounded-full text-ink-soft ${collapsed ? "shadow-raised-sm" : ""}`}>
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className={`size-5 transition-transform ${collapsed ? "" : "rotate-180"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 15 6-6 6 6" />
                </svg>
              </span>
            </button>
            <div id="map-station-detail" className={collapsed ? "hidden lg:block" : ""}>
            <div className="flex flex-wrap gap-1.5">
              {selected.id === data.bestTotalId && (
                <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold">거리까지 따지면 가장 덜 들어요</span>
              )}
              {selected.id === data.cheapestId && (
                <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold">리터당 가장 싸요</span>
              )}
            </div>
            <h2 className="mt-2 text-lg font-bold">
              {selected.name} <span className="text-sm font-normal text-ink-soft">{selected.brand}</span>
            </h2>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-3xl font-bold tabular-nums">
                {won(selected.paidPrice)}
                <span className="ml-0.5 text-base font-medium">원/L</span>
              </p>
              <p className="text-sm text-ink-soft tabular-nums">직선 {selected.distanceKm}km</p>
              {selected.discountWon > 0 && (
                <p className="text-xs text-ink-soft tabular-nums">
                  할인 {won(selected.discountWon)}원 반영 · 오피넷 {won(selected.price)}원
                </p>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-hairline pt-3 text-sm">
              <div>
                <dt className="text-xs text-ink-soft">{data.fill.label} 넣으면</dt>
                <dd className="font-semibold tabular-nums">{won(selected.fillWon)}원</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">오가는 기름값 포함</dt>
                <dd className="font-semibold tabular-nums">
                  {won(selected.totalWon)}원 <span className="text-xs font-normal text-ink-soft">(+{won(selected.tripWon)})</span>
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {detail?.id === selected.id ? (
                <span className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft shadow-inset-sm tabular-nums">
                  {detail.body === null ? "기준 시각 확인 중…" : myPrice ? basis(myPrice.updatedAt) : "기준 시각 정보 없음"}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => loadDetail(selected)}
                  className="rounded-full px-3.5 py-2 text-sm font-semibold shadow-raised-sm"
                >
                  가격 기준 시각 보기
                </button>
              )}
              <a
                href={`https://map.kakao.com/link/to/${encodeURIComponent(selected.name)},${selected.lat},${selected.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
              >
                길찾기
              </a>
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              {PUMP_NOTE} {data.distanceNote} 연비 {data.kmpl}km/L 기준.
              {data.excludedCount > 0 && ` 뺀 상표 ${data.excludedCount}곳은 표시하지 않았어요.`}
            </p>
            </div>
          </article>
        ) : data ? (
          <p className="pointer-events-auto w-fit rounded-full bg-ground/95 px-4 py-2 text-sm shadow-raised-sm">
            가격 표시를 누르면 자세히 보여 드려요.
          </p>
        ) : null}
      </div>

      {state === "loading" && data && (
        <p role="status" className="absolute top-32 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ground px-3 py-1.5 text-xs shadow-raised-sm">
          새 조건으로 불러오는 중…
        </p>
      )}
    </section>
  );
}
