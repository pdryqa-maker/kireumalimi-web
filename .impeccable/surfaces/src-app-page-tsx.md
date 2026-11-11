---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/chat/page.tsx","src/components/ChatPanel.tsx"]
---

## Scope

- Surface: the site's first screen (`/`), which is the 주유 챗봇 for now. `/chat` points here. Whether 등유 안심 joins this site is undecided, so it is not linked.
- Visitor mode: Operate. Judges watch a demo of a driver asking about 울주군 fuel prices.
- Job: ask in plain Korean or tap a suggested question, read prices with their 기준 시각, open a station's detail, see the past-notice record.
- Important states: empty (first visit), user question, loading (skeleton), price list, station detail, plain answer, error with retry.
- Constraints: numbers must stay the most legible thing on screen; WCAG AA text contrast; no emoji; team 유일무이 logo visible; footer source label; no 오피넷/석유공사 look.
- Pinned by user: neumorphism, skeleton loading.
- Failure looks: generic AI-chat slop, emoji, numbers buried under decoration.

## Direction contract

THESIS: A soft, single-material control surface where questions press into the surface and answers rise out of it; it refuses the default chat app of flat bubbles on white and a gradient send button.

OWN-WORLD: One warm stone-grey material (#E4E2DA family) carrying paired light and dark shadows; ink near-black #1B1C18 for text and prices; 유일무이 yellow from the team logo as the only accent, used for the send control, selection, focus, and the active fuel. Pretendard, tabular numerals for prices.

STORY: The judge sees a working assistant for 울주군 drivers, taps a question, watches grooves in the surface shimmer while it looks up 오피넷, then reads prices with the time they were reported.

FIRST VIEWPORT: Slim header with the 유일무이 mark, 기름알리미 name, and a pressed 시연 지역 label. One large raised panel fills the rest: on first visit a short heading and three raised suggested questions; composer docked at the panel's bottom with the pressed fuel switch, inset input, and yellow raised send button. Source line in the footer.

FORM: user-pinned neumorphism translated to an Operate screen; signature move is press-in for the visitor's questions and rise-out for answers, with skeletons as inset grooves. The roll ran after the build began; the user-pinned direction stands over its assignment. seed:4515ee3616d8e4df

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
