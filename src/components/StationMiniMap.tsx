"use client";

// 챗봇 답 위의 작은 지도: 답에 나온 주유소를 가격 표시로 찍는다. 오른쪽 아래 단추로 크게 펼친다.
// 대화가 길어지면 지도(WebGL)가 쌓여 느려지므로, 마지막 지도 답만 바로 그리고 앞의 답은 '지도 보기' 단추로 둔다(live).
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { won } from "./format";
import { loadMapLib, markerElement, originElement, PILL, STYLE_URL, tidyBaseMap } from "./mapBase";

export type MiniMapData = {
  origin: { name: string; lat: number; lon: number } | null;
  points: { id: string; name: string; brand: string; price: number | null; lat: number; lon: number }[];
};

function MapCanvas({
  data,
  interactive,
  onPick,
  className,
}: {
  data: MiniMapData;
  interactive: boolean;
  onPick?: (id: string) => void;
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  // 누를 수 있는지만 지도 다시 그리기에 쓴다(함수가 바뀔 때마다 지도를 새로 만들지 않게).
  const pickable = Boolean(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let map: MapLibreMap | null = null;
    let cancelled = false;
    (async () => {
      const { Map, Marker, LngLatBounds, NavigationControl } = await loadMapLib();
      if (cancelled || !ref.current) return;
      const first = data.points[0] ?? data.origin;
      if (!first) return;
      map = new Map({
        container: ref.current,
        style: STYLE_URL,
        center: [first.lon, first.lat],
        zoom: 14,
        interactive,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      if (interactive) {
        map.touchZoomRotate.disableRotation();
        map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
      }
      const created = map;
      created.on("load", () => tidyBaseMap(created));

      if (data.origin) {
        new Marker({ element: originElement(data.origin.name) }).setLngLat([data.origin.lon, data.origin.lat]).addTo(created);
      }
      data.points.forEach((point, rank) => {
        const { root, button } = markerElement(() => pickRef.current?.(point.id));
        button.className = `${PILL} ${rank === 0 ? "bg-ink text-on-accent shadow-raised" : "bg-ground text-ink shadow-raised-sm"} ${pickable ? "hover:scale-105" : "cursor-default"}`;
        // 순위 번호를 앞에 붙여 아래 목록과 맞춰 보게 한다(같은 가격이 여럿이어도 구분된다). 하나뿐이면 번호를 빼고 이름을 쓴다.
        if (data.points.length > 1) {
          const order = document.createElement("span");
          order.className = "text-[11px] font-semibold opacity-60";
          order.textContent = String(rank + 1);
          button.append(order);
        }
        button.append(point.price ? won(point.price) : point.name);
        button.setAttribute("aria-label", `${rank + 1}. ${point.name}${point.price ? ` ${won(point.price)}원` : ""}`);
        root.style.zIndex = String(data.points.length - rank);
        new Marker({ element: root }).setLngLat([point.lon, point.lat]).addTo(created);
      });

      const all = [...data.points, ...(data.origin ? [data.origin] : [])];
      if (all.length > 1) {
        const bounds = new LngLatBounds([all[0].lon, all[0].lat], [all[0].lon, all[0].lat]);
        for (const item of all) bounds.extend([item.lon, item.lat]);
        created.fitBounds(bounds, { padding: { top: 40, bottom: 40, left: 48, right: 48 }, maxZoom: 15, duration: 0 });
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [data, interactive, pickable]);

  return <div ref={ref} className={className} />;
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </svg>
  );
}

export function StationMiniMap({
  data,
  title,
  live,
  onPick,
}: {
  data: MiniMapData;
  title: string;
  live: boolean;
  onPick?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  if (data.points.length === 0) return null;
  const pickAndClose = onPick
    ? (id: string) => {
        setOpen(false);
        onPick(id);
      }
    : undefined;

  return (
    <>
      {live ? (
        <div className="relative mb-3 h-44 overflow-hidden rounded-2xl shadow-inset-sm">
          <MapCanvas data={data} interactive={false} onPick={onPick} className="h-full w-full" />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`${title} 지도 크게 보기`}
            className="absolute right-2.5 bottom-2.5 z-10 grid size-9 place-items-center rounded-full bg-ground shadow-raised"
          >
            <ExpandIcon />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-raised-sm"
        >
          <ExpandIcon />
          지도로 보기
        </button>
      )}

      {open && (
        <div role="dialog" aria-modal="true" aria-label={`${title} 지도`} className="fixed inset-0 z-50 flex flex-col bg-ground">
          <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
            <h2 className="min-w-0 flex-1 truncate font-semibold">{title}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              autoFocus
              className="rounded-full px-4 py-2 text-sm font-semibold shadow-raised-sm"
            >
              닫기
            </button>
          </div>
          <MapCanvas data={data} interactive onPick={pickAndClose} className="min-h-0 flex-1" />
          <p className="border-t border-hairline px-4 py-2.5 text-xs text-ink-soft">
            검은 표시가 1위예요.{onPick ? " 가격 표시를 누르면 그 주유소를 자세히 알려 드려요." : ""} 거리는 직선거리예요.
          </p>
        </div>
      )}
    </>
  );
}
