import type { Metadata } from "next";
import StationMap from "@/components/StationMap";

export const metadata: Metadata = {
  title: "지도 · 기름알리미",
  description: "출발 위치 반경 5km 주유소를 지도에서 가격과 오가는 기름값까지 비교해 보세요.",
};

export default function MapPage() {
  return <StationMap />;
}
