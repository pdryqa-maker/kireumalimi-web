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

## 오피넷 호출

화면에서는 오피넷을 직접 부르지 않고 이 사이트의 서버 경로를 부릅니다.

```text
/api/opinet/avgAllPrice
/api/opinet/lowTop10?prodcd=B027&area=01&cnt=5
```

쓸 수 있는 API는 `route.ts`의 `ALLOWED_ENDPOINTS`에 있습니다. 필요한 API가 없으면 여기에 추가합니다.

## 주의

- 인증키는 `.env.local`에만 둡니다. 코드, 채팅, 공유 폴더에 넣지 않습니다.
- 일반 키는 하루 300회까지입니다. 같은 요청은 10분간 재사용하지만, 인터넷에 공개하기 전에는 호출 제한을 추가해야 합니다.
- 화면에는 "한국석유공사 오피넷 제공"과 "공공데이터 활용 시제품"을 유지합니다. 오피넷이나 공사의 로고와 디자인을 흉내 내지 않습니다.

## 고정 질문 데이터

`src/data/fixed_question.json`은 `11월/챗봇_고정질문_데이터/build_fixed_question.py`로 만든 파일을 복사한 것입니다. 지역을 추가했다면 스크립트를 다시 실행하고 이 파일을 교체합니다.
