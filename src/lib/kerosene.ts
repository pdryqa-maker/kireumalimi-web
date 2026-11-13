// 같은 팀의 등유 안심 시제품(김형준·목서환). 기름알리미는 차량 연료를, 등유 안심은 등유 보일러 가구를 맡는다.
export const KEROSENE_APP = {
  name: "등유 안심",
  url: "https://deungyu-alimi.vercel.app",
  pitch: "등유 보일러를 쓰는 어르신 댁의 기름이 떨어지기 전에, AI가 먼저 전화해 동의를 받고 주문을 넣어 드려요.",
  screens: [
    { path: "/households", title: "가구 잔량", who: "생활지원사 · 가족", body: "울주 기온과 예보로 집마다 남은 기름과 소진 예상일을 계산해요." },
    { path: "/call", title: "AI 전화", who: "어르신", body: "AI가 먼저 전화해 눈금을 묻고, 동의하시면 주문을 넣어요." },
    { path: "/dealer", title: "판매소", who: "등유 판매소", body: "들어온 주문을 확인하고 배달량을 입력해요." },
    { path: "/dashboard", title: "군 현황판", who: "울주군 담당", body: "살펴봐 주세요 가구, 한파 위험, 겨울 부족액을 한 화면에." },
  ],
};
