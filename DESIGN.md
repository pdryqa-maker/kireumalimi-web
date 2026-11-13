---
name: 기름알리미
description: Ask about fuel prices near you in plain Korean; answers come only from 오피넷 lookups, each with its 기준 시각, tuned to your location and car.
colors:
  paper: "#ffffff"
  canvas: "#f4f5f7"
  ink: "#15171c"
  ink-soft: "#5c6270"
  hairline: "#e3e5ea"
  flame: "#e8470f"
  flame-soft: "#fff1e8"
typography:
  greeting:
    fontFamily: "Pretendard Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  price:
    fontFamily: "Pretendard Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    fontFeature: "\"tnum\""
  body:
    fontFamily: "Pretendard Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Pretendard Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  card: "1.5rem"
  tile: "1rem"
  pill: "9999px"
---

# Design System: 기름알리미

Rewritten on 2026-11-13 when the screen moved from the stone neumorphic console to a bright white layout (배재원's request, following the team's reference images). The earlier "Pressed Stone Console" is in git history (commit 64bfd44).

## Overview

**North star: "A clear morning forecourt."** White paper, thin grey lines, and one warm flame. The screen should feel like asking a calm attendant who already knows your car and your street.

- Tabs (2026-11-14, named like a general chatbot app): 홈, 탐색, 내 기록, 알림. 홈, 탐색, and 내 기록 are the same chatbot with different starter questions, so every tab can take a free question; 알림 is the alert conditions page. 내 정보 is no longer a tab: it opens from the avatar (header on phones, bottom of the left menu on desktop), or the 로그인 button for guests.
- Desktop: a 5.5rem left menu (team mark, the four tabs, avatar at the bottom; 등유 안심 was removed on 2026-11-13 because both apps will sit under a parent site later), a slim header (한국석유공사 logo, 기름알리미, login or the user's avatar; no place chip, since the home summary already shows 내 위치), and one centered 48rem column.
- Phone: the same header, content, and a floating pill tab bar at the bottom with the same four tabs.
- The chat input carries a camera button on its left ("영수증 사진 보내기"); a sent photo shows as a small thumbnail in the user's bubble, and the reading comes back as a receipt card (date, liters, price per liter, total, station) with "주유 기록에 넣기" and "넣지 않기". Nothing is saved until the user presses the first.
- The chat home opens with the flame orb, one line of today's top fuel news with the user's name first ("재원님, 내일부터 12차 석유 최고가격이 적용돼요"; a plain greeting only if the news has not loaded), "기름값, 무엇이든 물어보세요", the 오늘의 기름 소식 panel (my area and nationwide average price with the change since yesterday, the current 최고가격 round, days left in the 유류세 cut, and the next alert for signed-in users; two columns even on phones), a one-line login prompt for guests, four question cards with icons (cheapest nearby, "요즘 기름값 왜 이래?", the 유류세 cut, the 최고가격 notice), and chips (the last notice's effect on my area, a price alert example, 알림 조건 걸기).
- 탐색 and 내 기록 open with a smaller orb (no glow), the tab name as the title, one line under it, and the same card grid and chips. 탐색: cheapest, distance-aware pick, station check (names the last receipt's station when there is one), 요소수 stock; chips for a regular station's standing and whether 알뜰 is really cheap. 내 기록: the line counts my fills and the latest date; cards for a receipt photo, this month's report, the next fill date, last month's report; a chip for money saved against the average.
- Each tab keeps its own conversation; switching tabs starts fresh, as switching pages did before.
- During a conversation the suggestions sit in one horizontally scrolling row below desktop width, and wrap only at `lg`.
- The monthly report card leads with the month's spend in large type, then a 2×2 grid (fills, liters, estimated distance, cost per km), one sentence on money saved against the 시도 average, one line comparing with last month, and the list of fills. An empty month says so and offers the photo picker.

## Colors

- **Paper** `#ffffff`: page, cards, inputs.
- **Canvas** `#f4f5f7`: question cards, the user's own message bubble, quiet wells, hover fills.
- **Ink** `#15171c`: all primary text, and the fill of primary actions (login, send, 조건 추가, active fuel) with white text.
- **Soft Ink** `#5c6270`: secondary text, labels, notes (meets AA on paper and canvas).
- **Hairline** `#e3e5ea`: the 1px ring that outlines cards, chips, and inputs, and list dividers.
- **Flame** `#e8470f` (with the orb gradient from amber `#ffb347` to deep red `#b92c0c`): taken from the 한국석유공사 logo. Used only for the orb, icons in question cards and summary, the active tab icon, the place pin, and switches that are on. Never for text blocks or large fills.
- **Flame soft** `#fff1e8`: the guest login prompt, card hover, text selection.

**One flame rule.** The flame marks identity and "on" states. Everything else is ink on paper.

## Typography

Pretendard Variable only. The news line above the question is 1.125rem Soft Ink and reads like something a person would say, never a translated "Good evening"; the question under it is 1.75rem (2.25rem on wide screens) bold with tight tracking. Prices stay the heaviest thing on any answer card, bold tabular numerals, each with its 기준 시각. Body 15px, labels 0.75rem. Korean breaks between words (`word-break: keep-all`).

## Elevation and shape

Depth is a hairline ring plus, for floating things only, a soft long shadow (`0 10px 28px -16px`). Cards 1.5rem radius, question cards and wells 1rem, every control a pill. The existing class names keep their jobs: `shadow-raised` (card ring with soft shadow), `shadow-raised-sm` (outlined control), `shadow-inset`/`shadow-inset-sm` (inner ring for wells and inputs).

## Motion

One orchestrated moment: the orb breathes slowly (5.5s). Answers rise 4px and fade in. Skeleton lines shimmer on canvas. All of it collapses under `prefers-reduced-motion`.

## Do and don't

- Do put the price first and pair it with its 기준 시각 and the 오피넷-versus-pump note.
- Do keep the user's own data visible where it changes an answer (내 위치, 내 차) and link it to 내 정보.
- Do say where a fuel-economy figure comes from, right next to it: "아반떼 공인 연비, 반반 기준", "중형 휘발유 차 평균", "직접 넣은 연비". Official figures read high against real driving; say so once, and never invent a correction factor.
- Do say fill amounts the way people order at the pump: "5만원어치(약 27L)", "가득(약 40L)". Show liters only in parentheses, as the converted value, and say what price or receipts the conversion used.
- Do say plainly when something is only a preview (Kakao messages are not sent).
- Don't use the flame for paragraphs, borders around text, or warnings.
- Don't imitate 오피넷 pages or logos. The 한국석유공사 logo appears only as the original file in the header.
