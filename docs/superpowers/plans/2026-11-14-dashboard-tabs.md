# 탐색·내 기록 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 탐색과 내 기록을 기능 상자·숫자·그래프가 먼저 보이는 대시보드로 바꾸고, 결과는 대시보드 안 패널(휴대폰은 시트)에 띄운다.

**Architecture:** 대화 로직은 지금 `ChatPanel` 하나에 다 있다. 이를 새로 쓰지 않고 `variant: "panel"`로 패널 안에서 돌게 하고, 대시보드는 `ref`의 `run(command)`로 기능을 실행한다. 조건 줄은 `ConditionBar`로 떼어 홈과 탐색이 함께 쓴다. 내 기록 숫자와 그래프는 브라우저 장부로 셈하는 순수 함수(`fillTotals.ts`)로 만든다.

**Tech Stack:** Next.js 16, React 19(ref as prop), Tailwind 4, TypeScript. 차트 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-11-14-dashboard-tabs-design.md`

## Global Constraints

- 탐색을 열 때 오피넷을 부르는 요청 0번. 내 기록은 처음 보는 달에만 `/api/fuel-report` 1번, 다시 열면 0번.
- 가짜 예시 숫자를 기록으로 저장하거나 보여 주지 않는다.
- 서버·AI로 보내는 장부는 최대 30번(`MAX_LEDGER`), 브라우저 장부는 최대 100번(`MAX_SAVED_LEDGER`).
- DESIGN.md 규칙: 잉크·종이·회색 선, 불꽃색은 정체성과 "켜진 상태"(고른 달)에만.
- 화면 문구는 존댓말, 짧게. 숫자 옆 기준(조회 시각, 무엇 기준)은 지금 카드 그대로.
- 테스트는 `APP_ROOT=$W node --import $S/apptest/register.mjs <script>`, 마무리는 `npx tsc --noEmit`, `npx eslint .`, `npx next build`.

## Review Focus

- 기록 0번·1번인 사람: 숫자 카드 "—", 다음 주유일은 기록 넣기 안내, 그래프는 빈 격자. 예외 없이 그려져야 한다.
- 100번이 꽉 찬 장부: 가장 오래된 달 "일부", 그 앞 달 "기록 전", 그 달과의 지난달 대비 없음.
- 상자를 연달아 누르기: 앞 기능의 늦게 온 답이 새 대화에 끼어들지 않는다.
- 휴대폰에서 시트를 닫았다 다시 열기, 사진 고르기를 취소하기.
- 오래된 달의 리포트: 최근 30번 밖의 달도 그 달 기록만 보내 리포트가 비지 않는다.

---

### Task 1: 장부 한도, 달별 합계, 입력 카드 안내 글

**Files:**
- Modify: `src/lib/ledger.ts`, `src/lib/savedLedger.ts`, `src/lib/fuelReport.ts`, `src/components/FillCards.tsx`
- Create: `src/lib/fillTotals.ts`
- Test: `$S/apptest/run10.mjs`

**Interfaces:**
- Produces: `MAX_SAVED_LEDGER = 100`; `cleanLedger(value, max = MAX_LEDGER)`; `savedLedgerAll(): LedgerEntry[]`(브라우저 전체), `ledgerForServer()`(최근 30번), `ledgerForMonth(month: string)`(그 달과 전달, 최근 30번).
- Produces (`fillTotals.ts`, 서버 모듈을 import하지 않는다): `paidWon(entry)`, `totals(entries, kmpl)`(지금 fuelReport의 것 그대로 옮김), `monthKeys(today, count): string[]`(오래된 달부터), `monthlySpend(entries, today, count, capped): MonthSpend[]` with `MonthSpend = { month; won; fills; wonUnknownFills; liters; state: "before" | "partial" | "full" }`, `dotUnit(maxWon): 10000 | 20000 | 50000`.

- [ ] 테스트 `run10.mjs`: `monthlySpend` — 기록 없는 달 0원 `full`, 가장 오래된 기록보다 앞 달 `before`, `capped`면 가장 오래된 달 `partial`; 금액 없는 기록은 양×단가, 둘 다 없으면 `wonUnknownFills`; `dotUnit(240000)=10000`, `dotUnit(250000)=20000`, `dotUnit(490000)=20000`, `dotUnit(500000)=50000`; `cleanLedger(110개, MAX_SAVED_LEDGER).length=100`, 기본 30; `fuelReport`가 옮긴 `totals`로 같은 결과(run4·run7 그대로 통과).
- [ ] 구현. `mergeLedger`·`parseLedger`·`addLedgerEntry`는 `MAX_SAVED_LEDGER`. `FillLogCard`의 `initialRows`는 저장 기록이 없으면 값이 빈 행 3개와 placeholder(예: "50000")만, "예시 기록이에요" 문구는 "넣은 날짜와 금액을 적어 주세요"로.
- [ ] run10, run4, run7 통과 확인 후 커밋.

### Task 2: 조건 줄 값을 직접 쓴 질문에 넘기기

**Files:** Modify `src/lib/chatbot.ts`, `src/app/api/chat/route.ts`. Test: `$S/apptest/run11.mjs`(가짜 Claude 응답).

**Interfaces:**
- Produces: `type ScreenConditions = { fuel: string; amount: Amount; place: string }`, `cleanConditions(value: unknown, profile: Profile): ScreenConditions | null`(유종은 `PROFILE_FUELS`, 금액은 `cleanWon` 또는 "full", 장소는 `PLACES` 키 또는 위치가 있을 때만 "my"; 하나라도 틀리면 null), `answer(history, profile, image, ledger, conditions = null)`.
- 동작: conditions가 있으면 `{...profile, fuel, amount}`로 셈하고(내 차 설정 = 화면 금액), 이용자 정보에 "- 지금 화면에서 고른 조건: …. 질문에 따로 말하지 않으면 이 유종·주유량·출발 위치(place에 'eonyang')로 조회합니다." 한 줄(손님에게도).

- [ ] 테스트: 시스템 프롬프트에 조건 줄, `find_by_total_cost`를 '내 차 설정'으로 부르면 화면 금액으로 셈, 잘못된 조건은 무시, 조건이 없으면 지금과 같은 프롬프트.
- [ ] 구현, 테스트 통과, run7·run8·run9·run6 통과, 커밋.

### Task 3: ChatPanel을 결과 패널로도 쓰기

**Files:** Modify `src/components/ChatPanel.tsx`. Create `src/components/ConditionBar.tsx`.

**Interfaces:**
- Produces: `ConditionBar({ fuel, place, amount, onFuel, onPlace, onAmount })`(내 정보는 안에서 `useProfile`), `initialPlace(profile)`.
- Produces: `type PanelCommand = { kind: "nearby" } | { kind: "totalCost" } | { kind: "ask"; question: string } | { kind: "photo"; question: string } | { kind: "report"; month: string } | { kind: "fillForm" } | { kind: "forecast"; forecast: FillForecast }`; `type PanelHandle = { run(command: PanelCommand): void }`.
- ChatPanel props 추가: `variant?: "page" | "panel"`, `conditions?: { fuel; place; amount }`(주면 내부 선택 대신 사용), `ref?: React.Ref<PanelHandle>`, `onActivity?: (state: { busy: boolean; hasMessages: boolean }) => void`, `examples?: string[]`(패널 빈 화면 예시 질문).

- [ ] `run(command)`는 새 대화로 시작: 대화 번호(ref)를 올리고 메시지를 비운 뒤 실행. 끝난 답은 시작할 때의 대화 번호가 지금과 같을 때만 붙인다. `askFree`의 대화 기록도 새 대화면 이번 질문만.
- [ ] `nearby`는 조건 줄 출발 위치 반경 5km(`/api/stations/nearby` + `originQuery(place)`). `forecast`는 `submitForecast(forecast, { save: false })`(주유 기록을 덮어쓰지 않는다). `report`는 `ledgerForMonth(month)`를 보낸다.
- [ ] `askFree` 본문에 `conditions: { fuel, amount, place }`. `useBriefing`은 `section === "home"`일 때만.
- [ ] `variant="panel"` 화면: 시작 화면·조건 줄·추천 줄·바닥 출처 줄 없음, 빈 화면은 "이 탭에서 궁금한 것 물어보기"와 `examples` 칩, 높이는 부모를 채운다.
- [ ] 홈(`variant="page"`)은 지금과 똑같이 보이는지 미리보기로 확인, tsc·eslint 통과, 커밋.

### Task 4: 탐색 대시보드

**Files:** Create `src/components/DashboardPanel.tsx`, `src/components/ExploreDashboard.tsx`. Modify `src/app/explore/page.tsx`, `src/components/AppShell.tsx`.

- [ ] `AppShell`: `/explore`, `/records`는 넓은 본문(`max-w-6xl`, 머리글도 같은 폭)과 페이지 바닥 출처 줄. `/`만 채팅 화면 높이.
- [ ] `DashboardPanel({ open, onOpen, onClose, label, children })`: `lg` 이상은 오른쪽에 붙은 고정 열(`sticky top-14`, 화면 높이). 휴대폰은 아래에서 올라오는 시트(85dvh, 닫기 버튼, Esc로 닫힘, 탭 막대 위). 닫혀 있으면 탭 막대 위에 "물어보기"/"결과 보기" 알약 버튼. 움직임 줄이기 설정이면 애니메이션 없이.
- [ ] `ExploreDashboard`: 제목, 조건 줄(초기값은 내 정보), 상자 7개(스펙 표 그대로: 이름, 설명, "바로 조회"/"AI 답변 · 5~12초", 정보 칸에 실제 쓰는 조건만, 이름 칸, 실행 버튼). 패널이 바쁘면 실행 버튼 잠금. 누르면 패널을 열고 `run`.
- [ ] 미리보기 375px·데스크톱에서 확인: 열 때 네트워크에 `/api/` 요청 없음, 근처 최저가·거리 추천이 패널에 뜸, 상자 연타 시 섞이지 않음. 커밋.

### Task 5: 내 기록 대시보드

**Files:** Create `src/components/RecordsDashboard.tsx`, `src/components/MonthlyChart.tsx`. Modify `src/app/records/page.tsx`.

- [ ] 데이터: `useStored(ledgerStore)`·`useStored(fillStore)` → `mergeLedger`, 유종·연비는 내 정보. 고른 달(처음 이번 달).
- [ ] 숫자 카드 4개(스펙대로). "시도 평균보다" 줄: 그 달 단가 있는 기록이 있을 때만 `/api/fuel-report`(그 달과 전달 기록, 내 정보 유종)로 받아 `localStorage`에 `kireumalimi.vsArea.{달}`과 그 달 기록 지문으로 남기고, 지문이 같으면 다시 부르지 않는다. "리포트 자세히" → `run({kind:"report"})`.
- [ ] `MonthlyChart({ months: MonthSpend[], unit, selected, onSelect })`: 달마다 점 쌓기(반 점 포함), `before`는 빈 칸·"기록 전", `partial`은 "일부", 고른 달 불꽃색, 달마다 sr-only 합계 글, 데스크톱 12달·휴대폰 6달.
- [ ] 다음 주유일 카드(최근 5번으로 `forecastNextFill`, 실패·2번 미만은 기록 넣기 → `run({kind:"fillForm"})`, "이날 넣을 곳" → `run({kind:"forecast"})`), 주유 기록 표(휴대폰은 목록), 영수증·계기판 찍기(→ `run({kind:"photo"})`), 빈 화면.
- [ ] 미리보기에 시험 장부를 넣어 확인(끝나면 원래대로): 숫자·그래프·표·달 고르기, 처음 열 때 `/api/fuel-report` 1번·다시 열 때 0번, 100번 꽉 찬 장부, 기록 0번. 커밋.

### Task 6: 문서와 마무리 확인

- [ ] DESIGN.md·PRODUCT.md·README의 탭 설명, 스펙의 "빌더에게 맡긴 것"에 정한 방법 기록.
- [ ] run4·run6·run7·run8·run9·run10·run11, tsc, eslint, next build 통과. 미리보기 정리(`.claude/launch.json` 되돌리기, `.playwright-mcp` 로그 정리). 커밋, PR 올리기(머지는 이용자 승인 뒤).
