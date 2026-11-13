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

- Demo region: 울산 울주군 (울산 is the 석유공사 headquarters city). Since 2026-11-13 the chatbot and alerts work for any 시도·시군구 nationwide; the demo still starts in 울주군.
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
- Tabs renamed and regrouped on 2026-11-14 so people can find the features: 홈 (today's prices and policy), 탐색 (finding and checking stations, 요소수), 내 기록 (receipts, monthly report, next fill), 알림. The first three are the same chatbot with different starter questions, so the chatbot stays the way in rather than one menu among many. 내 정보 moved to the avatar.
- Not built here on purpose: real Kakao login and account storage (needs a Kakao app, keys on the teammate's Vercel, and a database), address search (needs a geocoding key), 화물차 보조금 단가, 면세유, and research-institute estimates (official values not verified, or not official); Kakao delivery (prototype shows message previews only); road distance (straight-line only).
- API keys (오피넷, Claude) stay server-side in `.env.local`; the repository is public.
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
