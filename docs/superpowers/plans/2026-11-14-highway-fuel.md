# 고속도로 휴게소 주유소 안내 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 챗봇이 "언양에서 서울 가는데 어디서 넣을까?"에 지나는 순서대로 휴게소 주유소 가격과 그 길 최저가, 출발 전 비교 한 줄로 답한다.

**Architecture:** 휴게소 좌표와 방향 도시 좌표는 고정 표(`expresswayPlaces.ts`), 가격은 도로공사 API에서 30분 캐시로 받는다(`expressway.ts`). 챗봇 도구 `find_highway_stations`가 이를 부르고, 출발지가 있으면 기존 `findNearby`로 근처 최저가를 함께 돌려준다.

**Tech Stack:** Next.js 16, TypeScript, proj4(KATEC 변환, 기존 `katec.ts`), 한국도로공사 공공데이터 API, OpenStreetMap(좌표 표를 만들 때 한 번).

**Spec:** `docs/superpowers/specs/2026-11-14-highway-fuel-design.md`

## Global Constraints
- 인증키는 `process.env.EX_API_KEY`만. 오류·기록에 키가 든 주소를 남기지 않는다.
- 비교 문구는 정확히 "타기 전에 넣으면 더 아낄 수 있습니다."
- 국제유가 한 줄은 정확히 "국내 판매가는 보통 국제유가와 환율 변화를 2~3주 늦게 따라갑니다." (숫자 검사 때문에 도구 결과에 넣는다)
- 유종: 휘발유→gasolinePrice, 경유→diselPrice, 자동차부탄→lpgPrice. 그 밖은 RangeError.
- 다음 5곳, 직선거리 표기, "X"는 가격 없음.

## Review Focus
- 출발지가 노선에서 30km 넘게 떨어짐(예: 울주에서 서해안선): 노선 전체를 순서대로, 출발 전 비교는 그대로 → Task 2 테스트 `far origin`.
- 노선 이름을 다르게 부름(함양울산고속도로, 경부고속도로): 별칭으로 맞추거나 고를 수 있는 노선 목록을 돌려줌 → Task 2 `route alias`.
- 방향이 그 노선에 없음(경부선 목포 방향): RangeError에 그 노선의 방향을 담음 → Task 2 `bad direction`.
- 근처 오피넷 조회 실패: 휴게소 목록은 그대로, beforeBoarding은 null과 이유 → Task 2 `nearby fails`.
- 도로공사 응답 실패나 code≠SUCCESS: HighwayError("도로공사 휴게소 가격을 불러오지 못했습니다.") → Task 2 `api fails`.

---

### Task 1: 좌표 표

**Files:** Create `src/lib/expresswayPlaces.ts` (생성 스크립트는 scratchpad, 저장소 밖)

**Interfaces:** Produces `STATION_COORDS: Record<string, [number, number]>`(주유소 이름 → [위도, 경도]), `DIRECTION_COORDS: Record<string, [number, number]>`(방향 이름 → [위도, 경도]).

- [ ] 도로공사 위치 API와 이름으로 이은 168곳 + OSM에서 방향별 휴게소로 찾은 나머지, 방향 이름 38개를 표로 만든다. 출처와 조회일을 주석으로 단다.
- [ ] 검토: OSM으로 찾은 각 휴게소가 표시 이름에 해당 고속도로를 담는지, 같은 휴게소 반대 방향과 2km 안인지 확인. 못 찾은 곳은 표에서 뺀다.

### Task 2: `expressway.ts`

**Files:** Create `src/lib/expressway.ts`; Test: scratchpad `apptest/run6.mjs`(가짜 도로공사·오피넷 응답)

**Interfaces:**
- Consumes: Task 1 표, `toKatec`(katec.ts), `findNearby`, `Origin`, `kstTime`(stations.ts).
- Produces: `HIGHWAY_FUELS`, `HIGHWAY_ROUTES: string[]`, `class HighwayError`, `highwayStations(fuel: string, route: string, direction: string, origin: Origin | null, liters: number | null)` → `{ route, direction, fuel, from, onRoute, fetchedAtKst, ahead[], remaining, cheapest, average, unlocated[], beforeBoarding, note }`.

- [ ] 테스트: 경부선 서울 방향, 언양 출발 → ahead 첫 곳 언양(서울), 다음 5곳, cheapest 황간(서울) 1819, average는 가격 있는 앞쪽 평균, beforeBoarding.vsAverageWon = 평균 − 근처 최저가, savingWon = round(차이 × liters), message "타기 전에 넣으면 더 아낄 수 있습니다.".
- [ ] 테스트: Review Focus 다섯 가지.
- [ ] 구현: 가격 쪽수(pageSize)만큼 numOfRows=99로 받아 30분 캐시. "1,864원" → 1864, "X" → null. 노선 이름은 공백·"고속도로"를 빼고 별칭(함양울산→밀양울산선)으로 맞춘다. 방향은 direction 값, 비면 이름 괄호 안. 앞쪽 = 방향 도시까지 거리 < 출발지의 거리, 순서 = 방향 도시까지 먼 곳부터.
- [ ] 실제 도로공사 API로 한 번 불러 경부선 서울 방향이 나오는지 확인(로컬 키).

### Task 3: 챗봇 연결, 국제유가 한 줄, 화면·문서

**Files:** Modify `src/lib/chatbot.ts`, `src/lib/briefing.ts`(priceStory), `src/components/ChatPanel.tsx`(탐색 탭 칩), `.env.example`, `README.md`, `PRODUCT.md`, `DESIGN.md`

- [ ] 도구 `find_highway_stations {fuel, route(enum HIGHWAY_ROUTES), direction, place(enum none + 출발지), fill, value}(주유량은 다른 도구와 같은 금액·가득·리터)`, 규칙 한 줄, 안내 가능 목록에 추가. HighwayError·RangeError 메시지는 기존처럼 도구 오류로 돌려준다.
- [ ] priceStory 결과에 `lagNote`(Global Constraints 문장)를 넣고, 규칙에 "답 끝에 lagNote를 한 번 붙이고, 국제유가를 더 물으면 오피넷 국제유가 메뉴를 안내"를 넣는다. 기존 "국제유가는 말하지 않는다"는 lagNote 밖의 원인에 한정.
- [ ] 탐색 탭 칩 "언양에서 서울 가는 길, 휴게소 어디서 넣을까?".
- [ ] 가짜 Claude 응답으로 도구 호출이 이어지는지 확인, `tsc`, `eslint`, `npm run build`.
- [ ] 커밋, PR. 배포(병합) 전에 Vercel에 `EX_API_KEY`를 넣어야 한다고 알린다.
