# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary viewer: competition judges.** The site is a working prototype for 한국석유공사 AI·데이터 서포터즈(AI누리즈) Mission 3 「AI 기반 국민 편의 서비스 및 아이디어 제안」. Judges see it in the submitted demo video and at the end-of-November results session. Success is that it reads as a real, trustworthy public-data service, not a class project.
- **Users the prototype represents** (scenarios shown in the demo, not live users):
  - Ordinary drivers asking where fuel is cheapest and whether a price is current.
  - Families of elderly kerosene-heating households, kerosene sellers, and local-government welfare staff (등유 안심 screens).
  - Elderly kerosene households themselves are reached by AI phone call, with no screen.

## Product Purpose

기름알리미 turns 한국석유공사 오피넷 data into a service that tells people before they run out and answers when they ask in plain words. It has two parts:

- **등유 안심 (lead part, about 65–70% of the report and demo):** predicts when a household's heating kerosene runs out, an AI calls the elderly resident first and places the order with consent, and flags households that may be going without heat. Built by 김형준·목서환 as a separate app (github.com/mokseo42-oss/deungyu-alimi, https://deungyu-alimi.vercel.app). This site's `/kerosene` page links to it.
- **주유 챗봇 (supporting part, about 25–30%):** drivers ask in plain Korean and get prices that come only from 오피넷 lookups, each with the time it was reported. Built by 지현민·배재원 in this repository.

## Positioning

Every number shown comes from 오피넷 data, never from the AI. Prices carry their 기준 시각, and the chatbot says what it cannot answer instead of guessing. The service also uses 석유공사 data competitors do not surface: daily station prices around 최고가격 notices and kerosene consumption.

## Operating Context

- Demo region: 울산 울주군 (울산 is the 석유공사 headquarters city). Since 2026-11-13 the chatbot and alerts work for any 시도·시군구 nationwide. Since 2026-11-14 nobody starts in 울주군: until a visitor picks a place (위치 고르기, no login needed), screens show 전국 only and ask for a place; the fixed question '지난 고시 뒤 우리 동네는?' stays the 울주군 example.
- Demo is recorded on video; the site is also publicly deployed at https://kireumalimi-web.vercel.app with call limits. Deadline 2026-11-20.
- Team 유일무이(油一無二) of four, working in one repository: github.com/pdryqa-maker/kireumalimi-web.

## Capabilities and Constraints

- Next.js 16 app router, Tailwind CSS 4, TypeScript.
- Working now: 울산 최저가 lookup (`lowTop10`), station detail with 기준 시각 (`detailById`), the fixed question "지난 고시 뒤 우리 동네는?" from aggregated past-price data, and a Claude (Opus 5.5) chatbot that calls those lookups as tools.
- Added 2026-11-13: 실질비용 ranking from a 울주군 읍면 start point (`aroundAll`, straight-line round trip), a 유류세 인하 alert preview combining 언제·어디서·얼마 (official values in `src/lib/policy.ts`: extended to 2027-01-31), price-alert conditions the AI proposes and the user saves in the browser, a server-side number check on AI answers, card summaries in chat history, and per-visitor call limits.
- Added 2026-11-13 (second pass): a 최고가격 notice explainer shown right after each announcement (values in `src/lib/policy.ts` `PRICE_CAP`), 내 차 주유 예보 from 2–5 fill records (interval average, no price prediction; records kept in the browser), and links from `/kerosene` and the chatbot to 등유 안심.
- Added 2026-11-13 (third pass): a bright white redesign (left menu on desktop, bottom tabs on phones) with a personalized home; 간편 로그인 that keeps name, location and car only in the browser (no password); nationwide "my location" lookups (phone location converted to KATEC, rounded to 100 m, which also fills the user's 시군구 from the nearest station's SIGUNCD; or an 오피넷 area code picked by hand); the chatbot prompt and tools follow the saved profile (coordinates never go to the AI); and `/alerts`, where users set price, 최고가격, 유류세 and 주유 예보 conditions and see which alerts they would get and when.
- Added 2026-11-13 (fourth pass): the home opens with 오늘의 기름 소식 instead of a generic greeting: 오피넷 average prices for my area and nationwide with the change since yesterday, the 최고가격 round in force, days left in the 유류세 cut, and the next alert. Real news articles are not shown; a news feed would need a separate source and a rule for checking it.
- Changed 2026-11-13: the 등유 안심 menu, home line and card button were removed from 기름알리미. The two apps will sit under one parent site later; until then the chatbot still points kerosene-household questions to 등유 안심.
- Added 2026-11-13 (fifth pass): nationwide areas for the chatbot and `/alerts` (area names like '부산 해운대구' resolved to 오피넷 codes; 광주 and 전남 come as one '전남광주' since the 2026-07-01 merger); a price explainer (change since yesterday, 7-day national change, which round the 최고가격 has held since, average price vs the supply cap, 유류세 cut; no causes outside those values); station lookup by name (`searchByName`); a standing check for a station (gap to the 시군구 average, rank within 5 km, cheaper option nearby), which also answers whether an 알뜰 station is really cheap; and receipt photos read by Claude into a fill record card the user confirms before saving (photo not stored; card and approval numbers ignored).
- Added 2026-11-14: a fuel ledger (last 30 fills with price, total, and station from receipts, kept in the browser); a monthly report card (fills, liters, money spent, distance estimated from liters × the car's km/L, cost per km, change from last month, and money saved or lost against that day's 시도 average price from `dateAreaAvgRecentPrice`); a station check (quality certification, 착한주유소, last price report date, gap to nearby prices, and receipts compared with the reported price only when the receipt is newer than that report; never a verdict of wrongdoing); and 요소수 stock search (`ureaPrice`, in-stock stations within 30 km or cheapest in an area, with phone numbers and report times).
- Fill amount in won (2026-11-14, later): people order fuel as "5만원어치" or "가득", not liters, and few know their tank size. 내 정보, the chat amount picker, and the next-fill record card now take 3만/5만/7만/10만원, 가득, or a typed amount. Calculations still run in liters: an amount is converted with today's national average price, and 가득 uses the median of recent receipt liters (40 L until there are two). Answers say "5만원어치(약 27L) 기준". Profiles saved in liters move to 가득 with that liter value, so their numbers do not change. This is step 1 of 3; car-model fuel economy and dashboard photos come next (`docs/superpowers/specs/2026-11-14-won-amount-fuel-economy-design.md`).
- Car fuel economy (2026-11-14, step 2 of 3): almost nobody changed the 12 km/L default, so distance costs and monthly mileage were the same for a 모닝 and a 카니발. 내 정보 now finds the car model in 한국에너지공단's official fuel-economy list (a snapshot in the repo, no key needed to deploy) and mixes its city and highway figures by how the person mostly drives (시내 위주, 반반, 고속도로 위주). People who don't know the model pick a car size and whether it is a hybrid, and get the median of domestic cars that size; typing a number still works. The source is shown next to the figure and told to the chatbot. Car size also sets the default liters for 가득.
- Dashboard photo and measured fuel economy (2026-11-14, step 3 of 3): official figures read high against real driving. A dashboard photo in chat is read for the odometer and the average km/L and shown on a confirm card; the average replaces 내 연비 only when the person taps it. Receipts can now be marked 가득 with the odometer, and once two such fills exist the app computes real km/L from distance over liters and uses it, saying so in chat. A number the person typed in by hand is never overwritten. 내 정보 links to this with "더 정확하게 하려면 계기판도 찍어 주세요".
- Added 2026-11-14 (later): expressway rest-area fuel. Asked "언양에서 서울 가는데 어디서 넣을까?", the chatbot picks the route and direction, lists the next 5 rest-area stations in passing order with price and straight-line distance, the cheapest on that road and its average (한국도로공사 `curStateStation`), and, when the start is known, compares the cheapest station within 5 km and says "타기 전에 넣으면 더 아낄 수 있습니다." Rest-area prices differ little (gasoline mostly 1,819–1,864원, 210 of 226 are 알뜰), so filling before getting on usually saves more than picking a rest area. 국제유가 is not its own feature: the price explanation ends with one line that domestic prices follow international prices and the exchange rate about 2–3 weeks later.
- Added 2026-11-14 (accounts): ID/password accounts so 내 정보, fills, the ledger, alert conditions and forecast settings follow the person across devices (Upstash Redis via Vercel, signed session cookie, scrypt hashes). Guests keep using everything in the browser; the first login merges what this browser had into the account. 로그아웃 clears this browser, 회원 탈퇴 deletes the account.
- Tabs renamed and regrouped on 2026-11-14 so people can find the features: 홈 (today's prices and policy), 탐색 (finding and checking stations, 요소수), 내 기록 (receipts, monthly report, next fill), 알림. 홈 stays the chatbot. Later the same day 탐색 and 내 기록 became dashboards: 탐색 is a set of feature boxes under one condition bar, 내 기록 shows the month's numbers, a monthly spend chart, the next fill date and the fill table. Results and free questions open in a panel inside the dashboard (right column on desktop, bottom sheet on phones). 내 정보 moved to the avatar. 내 기록 is about fueling records and works without 로그인; 로그인 is where people enter their own info (car, location) for more accurate predictions, so a fuel economy read from a photo is applied in place, not by sending people to 로그인.
- Not built here on purpose: Kakao login and password recovery (accounts are ID and password; recovery is planned through the KakaoTalk channel and is not mentioned on screen), address search (needs a geocoding key), 화물차 보조금 단가, 면세유, and research-institute estimates (official values not verified, or not official); Kakao delivery (prototype shows message previews only); road distance (straight-line only).
- API keys (오피넷, Claude, 한국도로공사) stay server-side in `.env.local`; the repository is public.
- The Vercel deployment is public; `src/lib/rateLimit.ts` caps calls per visitor and per server instance.
- 오피넷 general key is limited to 300 calls a day; chatbot answers take about 5–12 seconds.
- Prices are 오피넷-reported and may differ from the pump; this must be stated wherever prices appear.
- Station names are not shown for the past-notice records; whether to name stations elsewhere is undecided.

## Brand Commitments

- Service name: 기름알리미.
- Footer on every screen: "유가 정보: 한국석유공사 오피넷 제공 · 공공데이터 활용 · 팀 유일무이" ('시제품' dropped on 2026-11-13 at 배재원's request; screens still say plainly when something is only a preview).
- Team logo of 유일무이 must appear. Assets: `10월/인스타그램 게시물 레퍼런스/유일무이 로고.png` (yellow "1" with oil drop on black circle), `유일무이 로고_2.png` (black 유일무이 wordmark with 油一無二), `유일무이 로고_3.png` (black "1" on yellow circle).
- 한국석유공사 logo: shown in the header as the supporters-program mark, using the original file unchanged (2026-11-13, 배재원's request; needs team confirmation). The flame accent takes its red-orange from that logo. Do not imitate 오피넷 pages or logos.
- Voice: polite Korean 존댓말, short, no hype; never accuse stations of wrongdoing ("아직 그대로", not "늦게 내린").

## Evidence on Hand

- Live 오피넷 data through the server routes, and aggregated past prices for 울주군·마포구·서초구 in `src/data/fixed_question.json`.
- Measured: 7차 notice (2026-06-27, -150원), day 5 in 울주군 gasoline: 13 of 93 stations unchanged, average drop 66원.
- Chatbot test log of 2026-11-11 in `11월/00_챗봇_기획초안_지현민.md`.
- No user testimonials, usage numbers, or partner agreements exist; do not fabricate them.

## Product Principles

1. Numbers come from data; AI only understands and phrases.
2. Show when a price is from, and say it may differ at the pump.
3. Say what the service cannot answer rather than guess or predict.
4. Describe stations neutrally; aggregate where naming could harm.
5. 등유 안심 leads; the chatbot shows the service is for everyone.

## Accessibility & Inclusion

- Text and primary controls must meet WCAG AA contrast, even within the chosen visual style.
- Some viewers are older family members and local-government staff; keep text legible and controls large enough.
