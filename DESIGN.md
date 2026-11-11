---
name: 기름알리미
description: Ask about 울주군 fuel prices in plain Korean; answers come only from 오피넷 lookups, each with its 기준 시각.
colors:
  stone-ground: "#e4e2da"
  ink: "#1b1c18"
  ink-soft: "#57574d"
  yuilmui-yellow: "#ffd95a"
  hairline: "#cfccc1"
typography:
  headline:
    fontFamily: "Pretendard Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  price:
    fontFamily: "Pretendard Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
    fontFeature: "\"tnum\""
  title:
    fontFamily: "Pretendard Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Pretendard Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
  card-label:
    fontFamily: "Pretendard Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
  label:
    fontFamily: "Pretendard Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  tail: "6px"
  control: "1rem"
  card: "1.5rem"
  panel: "2rem"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "28px"
components:
  panel:
    backgroundColor: "{colors.stone-ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  answer-card:
    backgroundColor: "{colors.stone-ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  suggestion-button:
    backgroundColor: "{colors.stone-ground}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "16px 20px"
  suggestion-chip:
    backgroundColor: "{colors.stone-ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  user-question:
    backgroundColor: "{colors.stone-ground}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  basis-tag:
    backgroundColor: "{colors.stone-ground}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  fuel-switch-active:
    backgroundColor: "{colors.yuilmui-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  fuel-switch-idle:
    backgroundColor: "{colors.stone-ground}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  composer-input:
    backgroundColor: "{colors.stone-ground}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "14px 20px"
  send-button:
    backgroundColor: "{colors.yuilmui-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "48px"
---

# Design System: 기름알리미

## Overview

**Creative North Star: "The Pressed Stone Console"**

The whole interface is cut from one warm stone-grey material. Nothing is painted on top of it: every control, card, and tag is the same ground color, and form comes only from paired light and shade, a cool highlight from the upper left and a warm shadow to the lower right. What the visitor asks presses into the surface; what the service answers rises out of it. Loading is not a spinner but grooves in the stone catching a moving glint.

It is a working screen, not a showcase. Density is moderate, one column, one large raised panel holding the conversation and a docked composer. Numbers are the loudest thing on the material: prices in heavy tabular figures in near-black ink, always next to a pressed tag stating when they were reported. The one accent is the yellow of the team 유일무이 mark, and it marks only what is "on": the active fuel, the send control, selected text.

Rejected looks, confirmed for this product: the default chat app of flat bubbles on white with a gradient send button, and anything that resembles 오피넷 or 한국석유공사 pages, logos, or colors.

**Key Characteristics:**
- One material (stone ground), depth by paired light/shade shadows only.
- Questions inset, answers raised; skeletons are inset grooves.
- Near-black ink for all text; one yellow accent for "on" states.
- Prices in bold tabular numerals, each paired with its 기준 시각.
- Pretendard throughout, Korean word-keeping line breaks.

## Colors

A single warm stone neutral carries the whole screen; ink supplies all legibility and one logo yellow supplies all emphasis.

### Primary
- **유일무이 Yellow** (#ffd95a): the team-mark yellow. Fills the send button, the active fuel in the fuel switch, and text selection. Always carries ink text on it (12.5:1). It is near-invisible as an edge against the ground (1.06:1), so it never stands alone as a boundary: a yellow control also carries a raised shadow and ink content.

### Neutral
- **Stone Ground** (#e4e2da): the one material. Page, panel, cards, buttons, inputs, tags all share it; nothing gets a different fill to separate itself.
- **Ink** (#1b1c18): warm near-black for all primary text, prices, icons, caret, and the focus outline (13.2:1 on ground).
- **Soft Ink** (#57574d): secondary text, card labels, brand names, addresses, notes, placeholders, the idle fuel option (5.6:1 on ground, passes AA for small text).
- **Hairline** (#cfccc1): the only drawn line: row dividers in price lists, the composer's top rule (at 70% opacity), and the scrollbar thumb. Decorative only, never a carrier of meaning.

Shadow channels (stored as RGB triplets so alpha can vary): **shade** `160 154 136`, a warm darkened stone, and **light** `255 255 252`, an almost-white highlight.

### Named Rules
**The One Material Rule.** Every surface is Stone Ground. Separate things by raising or pressing them, never by giving them another fill. The only exception is yellow for an "on" state.

**The Yellow Means On Rule.** Yellow marks the active choice and the send action, nothing else: not headings, not decoration, not warnings.

## Typography

**Display Font:** Pretendard Variable (with Apple SD Gothic Neo, Malgun Gothic, sans-serif)
**Body Font:** Pretendard Variable (same stack)

**Character:** A single neutral Korean grotesque at several weights; hierarchy comes from weight and size, never from a second family. Weight axis loaded 45–920.

### Hierarchy
- **Headline** (700, 1.5rem rising to 1.875rem at 640px+, tight tracking -0.025em, balanced wrap): the empty-state question only, one per screen.
- **Price** (700, 1.5rem in detail and notice figures, 1.25rem in ranked lists, tabular numerals): every won amount and count. The 원/곳 unit follows at 0.875rem/500 with a hair of left margin.
- **Title** (600, 1rem): station names, detail card heading, suggested questions (500).
- **Body** (400, 15px, 1.625 line-height): answers, user questions, the composer text.
- **Card label** (600, 0.875rem, Soft Ink): the plain title that heads a result card ("울주군 휘발유 최저가"), stating what the card is.
- **Label** (500, 0.75rem, Soft Ink): 기준 시각 tags, notes, addresses, the 자세히 affordance, the footer source line.

Body text uses `word-break: keep-all` with `overflow-wrap: anywhere` so Korean breaks between words.

### Named Rules
**The Numbers Win Rule.** On any answer, the price or count is the heaviest, largest type on its card. Nothing decorative may outweigh it.

**The Tabular Rule.** Every number that can sit above or beside another number uses tabular numerals (rank, price, count, time).

## Layout

One centered column, max 48rem wide, 16px side padding (24px at 640px+). A slim header (36px logo, name, pressed region tag pushed right), then the panel, then a centered one-line footer source credit.

The panel fills the viewport height (100dvh minus 8.5rem, never under 32rem) and splits into a scrolling conversation area (24px top, 16px/28px sides) and a docked composer separated by a hairline rule. Messages stack with 20px gaps; answer cards cap at 34rem so they do not stretch across wide screens; user questions align right and cap at 85%.

Rhythm runs on 4px multiples: 8px/12px between small controls, 16px between suggestions, 20px card padding and message gaps, 28px panel side padding on desktop.

Responsive change at 640px: on phones the follow-up suggestion chips become a single horizontally scrolling row with hidden scrollbar; on wider screens they wrap.

## Elevation & Depth

Depth is the whole language. The system uses paired neumorphic shadows: a warm shade offset down-right and a light highlight offset up-left, both soft and wide, on surfaces the same color as the ground. Two directions exist, raised and inset, each in two sizes. There is no flat third state and no colored or hard shadow.

### Shadow Vocabulary
- **Raised** (`box-shadow: 9px 9px 20px rgb(160 154 136 / 0.5), -9px -9px 20px rgb(255 255 252 / 0.9)`): the panel, answer cards, skeleton card, empty-state suggestion buttons.
- **Raised small** (`box-shadow: 4px 4px 10px rgb(160 154 136 / 0.5), -4px -4px 10px rgb(255 255 252 / 0.9)`): small controls: suggestion chips, retry, send button, active fuel option.
- **Inset** (`box-shadow: inset 4px 4px 9px rgb(160 154 136 / 0.45), inset -4px -4px 9px rgb(255 255 252 / 0.85)`): the user's own questions, the composer input, pressed (active) large buttons.
- **Inset small** (`box-shadow: inset 2px 2px 5px rgb(160 154 136 / 0.45), inset -2px -2px 5px rgb(255 255 252 / 0.85)`): read-only wells: 기준 시각 tags, the region tag, notice figure tiles, the fuel switch track, skeleton grooves, row hover in price lists.

### Motion
- **Rise** (280ms, `cubic-bezier(0.16, 1, 0.3, 1)`): answers and skeleton cards lift 3px from a near-flat shadow into Raised.
- **Press** (280ms, same curve): a sent question starts Raised small and sinks into Inset.
- **Groove** (1.4s ease-in-out, infinite): a pale glint sweeps across inset grooves while loading.
- Both rise and press start from a visible state, so content is never hidden at frame zero. Under `prefers-reduced-motion: reduce` all animation and transition collapse to 1ms with a single iteration.

### Named Rules
**The Press In, Rise Out Rule.** What the visitor contributes is inset; what the service returns is raised. Read-only information wells (tags, figures) are inset small.

**The State Is Depth Rule.** Interaction states move along the depth axis: hover steps raised toward smaller (or into a small inset for list rows), active presses into inset, disabled sinks to inset small or drops to 50% opacity.

## Shapes

Everything is softly rounded and pill-ended; there are no square corners. The panel uses the largest radius (2rem), answer cards 1.5rem, buttons, questions, and figure tiles 1rem, and every small control, tag, track, input, and groove is a full pill. Message bubbles pinch one corner to 6px on the speaker's side (bottom-right for the user, bottom-left for plain answers) as the only hint of direction. Borders are absent except the hairline dividers.

## Components

### Buttons
Soft stone keys that sink when pressed.
- **Shape:** 1rem radius for full-width suggestions, full pill for chips and retry, a 48px circle for send.
- **Suggestion (empty state):** full-width, 16px/20px padding, title weight 500, Raised; hover to Raised small; active to Inset.
- **Suggestion chip (follow-up):** pill, 8px/14px, 0.875rem, Raised small; hover to Raised; active to Inset small; disabled 50% opacity while an answer is pending.
- **Send:** yellow circle with an inline-SVG up arrow in ink (2px stroke, round caps), Raised small; hover Raised; active and disabled Inset small.
- **Retry:** pill, 8px/16px, 0.875rem semibold, Raised small; active Inset small.
- **Focus:** a 2px solid ink outline offset 3px, globally.

### Chips
- **Fuel switch:** an Inset small pill track with 4px padding holding two options. Active option fills yellow with Raised small and ink text; idle option is Soft Ink with no shadow. Exposed as a radio group.
- **기준 시각 / region tag:** Inset small pill, 4px/10px, label type in Soft Ink, tabular numerals.

### Cards / Containers
- **Corner Style:** 1.5rem for answer cards, 2rem for the panel.
- **Background:** Stone Ground, same as the page.
- **Shadow Strategy:** Raised; answers enter with Rise.
- **Border:** none; inner lists use hairline dividers.
- **Internal Padding:** 20px (16px for the error card).

### Inputs / Fields
- **Style:** transparent fill on the ground, full pill, 14px/20px padding, 15px body text, Inset; placeholder in Soft Ink.
- **Focus:** the global ink outline with a tighter 1px offset.

### Price List (signature)
A raised card headed by a Soft Ink card label and an inset 조회 time tag. Each row is a whole-row button: rank in Soft Ink tabular, station name semibold with brand in Soft Ink, address truncated beneath, and the price right-aligned in bold tabular with a 자세히 label under it. Rows are separated by hairlines; hover presses the row into Inset small. The card ends with the 오피넷-versus-pump note.

### Notice Figures (signature)
Three Inset small tiles in a 3-column grid, each a Soft Ink label, a 1.5rem bold tabular value with unit, and a Soft Ink note. Followed by the prose answer in body type.

### Groove Skeleton (signature)
A Raised card containing Inset small pill grooves shaped like the expected answer (title bar, name/address lines with a price stub for lists; tapering 92/78/54% lines for text) with the Groove glint sweeping across. Announced to assistive tech as a status.

## Do's and Don'ts

### Do:
- **Do** build every surface from Stone Ground (#e4e2da) and give it form with the Raised or Inset shadow pairs.
- **Do** inset what the visitor sends and raise what the service returns.
- **Do** set every price and count in bold tabular numerals and pair every price with an inset 기준 시각 tag.
- **Do** keep all text in Ink or Soft Ink; Soft Ink (#57574d) is the lightest text color allowed on the ground.
- **Do** put ink text and a Raised small shadow on any yellow control so it reads by more than color.
- **Do** draw icons as inline SVG strokes in currentColor.
- **Do** honor reduced motion by collapsing rise, press, and groove.

### Don't:
- **Don't** fill a surface with any color other than the ground, except yellow for an "on" state.
- **Don't** use yellow for text, headings, borders, or decoration; it disappears against the ground (1.06:1).
- **Don't** use flat bubbles on white, gradient send buttons, spinners, or emoji.
- **Don't** use hard or colored shadows; shadows are always the warm shade and near-white light pair.
- **Don't** let any decorative element outweigh the price on a card.
- **Don't** borrow 오피넷 or 한국석유공사 logos, colors, or page design.
