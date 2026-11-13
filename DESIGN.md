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

- Desktop: a 5.5rem left menu (team mark, 주유 챗봇, 내 알림, 등유 안심, 내 정보, avatar at the bottom), a slim header (한국석유공사 logo, 기름알리미, login or the user's avatar; no place chip, since the home summary already shows 내 위치), and one centered 48rem column.
- Phone: the same header, content, and a floating pill tab bar at the bottom with the same four destinations.
- The chat home opens with the flame orb, a time-of-day greeting in everyday Korean with the user's name first ("재원님, 오늘 하루 수고 많으셨어요"), "기름 넣으러 가세요?", a three-cell summary (내 위치, 내 차, 다음 알림) for signed-in users or a login prompt for guests, four question cards with icons, and a row of chips.

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

Pretendard Variable only. The greeting line is 1.125rem Soft Ink and reads like something a person would say, never a translated "Good evening"; the question under it is 1.75rem (2.25rem on wide screens) bold with tight tracking. Prices stay the heaviest thing on any answer card, bold tabular numerals, each with its 기준 시각. Body 15px, labels 0.75rem. Korean breaks between words (`word-break: keep-all`).

## Elevation and shape

Depth is a hairline ring plus, for floating things only, a soft long shadow (`0 10px 28px -16px`). Cards 1.5rem radius, question cards and wells 1rem, every control a pill. The existing class names keep their jobs: `shadow-raised` (card ring with soft shadow), `shadow-raised-sm` (outlined control), `shadow-inset`/`shadow-inset-sm` (inner ring for wells and inputs).

## Motion

One orchestrated moment: the orb breathes slowly (5.5s). Answers rise 4px and fade in. Skeleton lines shimmer on canvas. All of it collapses under `prefers-reduced-motion`.

## Do and don't

- Do put the price first and pair it with its 기준 시각 and the 오피넷-versus-pump note.
- Do keep the user's own data visible where it changes an answer (내 위치, 내 차) and link it to 내 정보.
- Do say plainly when something is only a preview (Kakao messages are not sent).
- Don't use the flame for paragraphs, borders around text, or warnings.
- Don't imitate 오피넷 pages or logos. The 한국석유공사 logo appears only as the original file in the header.
