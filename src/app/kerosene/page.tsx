const SCREENS = [
  "잔량 예측: 가구별 예상 소진일 그래프",
  "AI 전화: 어르신과 나누는 음성 대화",
  "판매소: 오늘 주문과 소진 예상 마을",
  "지자체 현황판: 안부 확인 필요 가구와 한파 위험",
];

export default function KerosenePage() {
  return (
    <>
      <h1 className="text-2xl font-bold">등유 안심</h1>
      <p className="mt-2 text-foreground/70">김형준·목서환 담당 영역입니다. 아래 화면이 들어옵니다.</p>
      <ul className="mt-6 space-y-2">
        {SCREENS.map((screen) => (
          <li key={screen} className="rounded-lg border border-dashed border-foreground/30 p-4 text-sm">
            {screen}
          </li>
        ))}
      </ul>
    </>
  );
}
