// MapLibre v6는 지도 계산을 웹 워커에서 하는데, 번들러가 워커 파일을 옮겨 주지 않는다.
// 설치할 때마다 설치된 버전의 워커를 public/maplibre/로 복사해 같은 버전을 쓰게 한다(지도 화면은 setWorkerUrl로 이 파일을 쓴다).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const source = "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs";
if (existsSync(source)) {
  mkdirSync("public/maplibre", { recursive: true });
  copyFileSync(source, "public/maplibre/maplibre-gl-worker.mjs");
}
