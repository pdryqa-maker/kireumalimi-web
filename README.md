# 기름알리미 웹 시제품

팀 유일무이의 11월 Mission 3 시제품입니다. 등유안심과 일반 운전자 챗봇을 한 사이트에 담습니다.

## 실행

Node.js가 필요합니다.

```bash
npm install
```

`.env.example`을 복사해 `.env.local`을 만들고 `OPINET_API_KEY`에 오피넷 인증키, `ANTHROPIC_API_KEY`에 Claude API 키를 넣습니다. Claude 키가 없어도 버튼 질문은 동작하고, 자유 질문만 쓸 수 없습니다.

```bash
npm run dev
```

http://localhost:3000 에서 확인합니다.

## 담당과 폴더

| 화면 | 담당 | 위치 |
|---|---|---|
| 첫 화면, 공통 머리글·바닥글 | 공통 | `src/app/page.tsx`, `src/app/layout.tsx` |
| 등유 안심 | 김형준, 목서환 | `src/app/kerosene/` |
| 주유 챗봇 | 지현민, 배재원 | `src/app/chat/`, `src/components/ChatPanel.tsx` |
| 고정 질문 API | 지현민 | `src/app/api/fixed-question/` |
| 오피넷 API 프록시 | 지현민 | `src/app/api/opinet/[endpoint]/`, `src/lib/opinet.ts` |
| 주유소 조회(울산 최저가, 상세·기준 시각) | 지현민 | `src/lib/stations.ts`, `src/app/api/stations/` |
| 자유 질문 챗봇(Claude가 조회 기능을 골라 답함) | 지현민 | `src/lib/chatbot.ts`, `src/app/api/chat/` |
| 실질비용 추천(거리까지 따진 순위) | 배재원 | `src/lib/stations.ts`의 `findByTotalCost`, `src/lib/places.ts`, `src/app/api/stations/total-cost/` |
| 제도 변경 알림 미리보기(유류세 인하) | 배재원 | `src/lib/policy.ts`, `src/app/api/alert-preview/`, `src/components/AnswerCards.tsx` |
| 가격 알림 조건(AI가 제안, 이용자가 저장) | 배재원 | `src/lib/savedAlerts.ts`, `src/lib/chatbot.ts`의 `propose_price_alert` |
| 최고가격 고시 해설(발표 직후 해설) | 배재원 | `src/lib/policy.ts`의 `PRICE_CAP`, `src/components/AnswerCards.tsx`의 `CapCard` |
| 내 차 주유 예보(주유 기록으로 다음 주유일) | 배재원 | `src/lib/fillForecast.ts`, `src/components/FillCards.tsx` |
| 등유 안심 연결 | 배재원 | `src/lib/kerosene.ts`, `src/app/kerosene/` |
| 숫자 대조(AI 답변 속 숫자 검사) | 배재원 | `src/lib/numbers.ts` |
| 호출 제한 | 배재원 | `src/lib/rateLimit.ts` |

## 오피넷 호출

화면에서는 오피넷을 직접 부르지 않고 이 사이트의 서버 경로를 부릅니다.

```text
/api/opinet/avgAllPrice
/api/opinet/lowTop10?prodcd=B027&area=01&cnt=5
```

쓸 수 있는 API는 `route.ts`의 `ALLOWED_ENDPOINTS`에 있습니다. 필요한 API가 없으면 여기에 추가합니다.

## 기능 요약

- **언제·어디서·얼마**: 유류세 인하 버튼은 종료 예정일(언제), 내 주유량의 최대 추가 금액(얼마), 출발 위치에서 거리까지 따진 추천(어디서)을 한 카드에 보여 주고, 실제 서비스라면 보낼 카카오톡 문구를 미리 보여 줍니다. 시제품은 메시지를 보내지 않습니다.
- **실질비용**: 기름값(가격 × 주유량)에 출발 읍면에서 오가는 연료비(직선 왕복, 기본 연비 12km/L)를 더해 순위를 매깁니다. 오피넷 반경 조회(`aroundAll`, 반경 5km)를 씁니다. 거리는 직선거리라 실제 도로보다 짧습니다.
- **가격 알림 조건**: "1,750원 밑이면 알려 줘"를 AI가 조건으로 바꾸고, 이용자가 저장을 눌러야 이 브라우저에 저장됩니다. '지금 확인'을 누르면 오피넷 최저가와 맞춰 봅니다.
- **숫자 대조**: AI 답변 속 숫자가 도구 결과나 대화에 이미 나온 값에 없으면 한 번 다시 쓰게 하고, 그래도 다르면 답을 보내지 않습니다. 통과한 답에는 "숫자 n개 · 조회 결과와 대조해 일치"가 붙습니다.
- **최고가격 고시 해설**: 최고가격은 정해진 종료일이 없어 미리 알리지 않고, 발표 직후 차수·적용일·유종별 상한과 직전 차수 대비 변화를 쉬운 말로 풀어 줍니다. 공급가 상한이지 판매가 상한이 아니라는 점을 함께 밝힙니다.
- **내 차 주유 예보**: 주유 기록(날짜, 리터) 2~5개의 간격 평균으로 다음 주유 예상일을 셈하고, 그 주 월요일 아침에 한 번 보낼 알림(거리까지 따진 추천 포함)을 미리 보여 줍니다. 가격은 예측하지 않습니다. 기록은 이 브라우저에만 저장합니다.
- **등유 안심 연결**: 등유 보일러 가구(소진 예측, AI 전화, 판매소, 군 현황판)는 같은 팀의 [등유 안심](https://deungyu-alimi.vercel.app)이 맡습니다. `/kerosene`에서 그 화면으로 이어 주고, 챗봇도 등유 배달·바우처·한파 질문은 등유 안심으로 안내합니다.
- **대화 기록**: 버튼으로 받은 카드 답도 요약으로 대화 기록에 넣어, 자유 질문 때 AI가 앞 질문에 다시 답하지 않습니다.

## 오피넷에 없는 값

- 유류세 인하 값은 `src/lib/policy.ts`에 직접 적었습니다. 2026-11-11 재정경제부 결정 기준으로 2027-01-31까지, 리터당 휘발유 122원(15%), 경유 145원(25%), 부탄 51원(25%)입니다. 정부가 다시 연장하거나 바꾸면 이 파일만 고칩니다.
- 석유 최고가격은 `src/lib/policy.ts`의 `PRICE_CAP.rounds`에 차수별로 적었습니다. 새 차수가 발표되면 끝에 한 줄 추가합니다.
- 출발 위치는 울주군 12개 읍면 행정복지센터입니다(`src/lib/places.ts`). OpenStreetMap 위경도를 오피넷 좌표(KATEC)로 바꿨고, 범서읍 좌표로 반경 조회를 해 같은 길의 범서주유소가 127m로 나오는 것을 확인했습니다.

## 호출 제한

공개 주소라 인증키 한도와 비용을 지키려고 서버에서 셉니다(`src/lib/rateLimit.ts`).

| 대상 | 한도 |
|---|---|
| AI 자유 질문 | 한 사람(IP)당 10분에 15회, 서버 인스턴스당 하루 200회 |
| 조회 경로(`/api/stations/*`, `/api/alert-preview`, `/api/opinet/*`) | 한 사람당 10분에 60회 |
| 오피넷 실제 호출(캐시 제외) | 서버 인스턴스당 하루 250회 |

서버 메모리에 세므로 Vercel 인스턴스마다 따로 셉니다. 정확한 전체 제한이 필요하면 공유 저장소(KV 등)로 옮겨야 합니다.

## 주의

- 인증키는 `.env.local`에만 둡니다. 코드, 채팅, 공유 폴더에 넣지 않습니다.
- 일반 키는 하루 300회까지입니다. 같은 요청은 10분간 재사용하고, 위의 호출 제한이 걸려 있습니다.
- 화면에는 "한국석유공사 오피넷 제공"과 "공공데이터 활용 시제품"을 유지합니다. 오피넷이나 공사의 로고와 디자인을 흉내 내지 않습니다.

## 고정 질문 데이터

`src/data/fixed_question.json`은 `11월/챗봇_고정질문_데이터/build_fixed_question.py`로 만든 파일을 복사한 것입니다. 지역을 추가했다면 스크립트를 다시 실행하고 이 파일을 교체합니다.
