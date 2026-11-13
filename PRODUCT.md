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

- **등유 안심 (lead part, about 65–70% of the report and demo):** predicts when a household's heating kerosene runs out, an AI calls the elderly resident first and places the order with consent, and flags households that may be going without heat. Built by 김형준·목서환.
- **주유 챗봇 (supporting part, about 25–30%):** drivers ask in plain Korean and get prices that come only from 오피넷 lookups, each with the time it was reported. Built by 지현민·배재원.

## Positioning

Every number shown comes from 오피넷 data, never from the AI. Prices carry their 기준 시각, and the chatbot says what it cannot answer instead of guessing. The service also uses 석유공사 data competitors do not surface: daily station prices around 최고가격 notices and kerosene consumption.

## Operating Context

- Demo region: 울산 울주군 (울산 is the 석유공사 headquarters city).
- Demo is run locally and recorded on video; no public deployment in this phase. Deadline 2026-11-20.
- Team 유일무이(油一無二) of four, working in one repository: github.com/pdryqa-maker/kireumalimi-web.

## Capabilities and Constraints

- Next.js 16 app router, Tailwind CSS 4, TypeScript.
- Working now: 울산 최저가 lookup (`lowTop10`), station detail with 기준 시각 (`detailById`), the fixed question "지난 고시 뒤 우리 동네는?" from aggregated past-price data, and a Claude (Opus 5.5) chatbot that calls those lookups as tools.
- Added 2026-11-13: 실질비용 ranking from a 울주군 읍면 start point (`aroundAll`, straight-line round trip), a 유류세 인하 alert preview combining 언제·어디서·얼마 (official values in `src/lib/policy.ts`: extended to 2027-01-31), price-alert conditions the AI proposes and the user saves in the browser, a server-side number check on AI answers, card summaries in chat history, and per-visitor call limits.
- 등유 안심 screens are not built yet: household runout chart, AI phone call, seller order screen, local-government dashboard.
- API keys (오피넷, Claude) stay server-side in `.env.local`; the repository is public.
- The Vercel deployment is public; `src/lib/rateLimit.ts` caps calls per visitor and per server instance.
- 오피넷 general key is limited to 300 calls a day; chatbot answers take about 5–12 seconds.
- Prices are 오피넷-reported and may differ from the pump; this must be stated wherever prices appear.
- Station names are not shown for the past-notice records; whether to name stations elsewhere is undecided.

## Brand Commitments

- Service name: 기름알리미.
- Footer on every screen: "유가 정보: 한국석유공사 오피넷 제공 · 공공데이터 활용 시제품".
- Team logo of 유일무이 must appear. Assets: `10월/인스타그램 게시물 레퍼런스/유일무이 로고.png` (yellow "1" with oil drop on black circle), `유일무이 로고_2.png` (black 유일무이 wordmark with 油一無二), `유일무이 로고_3.png` (black "1" on yellow circle).
- Do not imitate 오피넷 or 한국석유공사 logos, colors, or page design.
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
