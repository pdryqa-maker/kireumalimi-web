import type { Metadata } from "next";
import Link from "next/link";
import { KEROSENE_APP } from "@/lib/kerosene";

export const metadata: Metadata = {
  title: "등유 안심 · 기름알리미",
  description: KEROSENE_APP.pitch,
};

// 같은 팀의 다른 축(등유 안심)으로 이어 주는 화면. 등유 안심은 따로 만든 시제품이라 그 주소로 연결한다.
export default function KerosenePage() {
  return (
    <section aria-labelledby="kerosene-title" className="rounded-[2rem] bg-ground p-6 shadow-raised sm:p-8">
      <p className="text-sm font-semibold text-ink-soft">기름알리미의 두 축</p>
      <h1 id="kerosene-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
        {KEROSENE_APP.name}
      </h1>
      <p className="mt-3 leading-relaxed text-balance">{KEROSENE_APP.pitch}</p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl px-4 py-3 shadow-inset-sm">
          <dt className="text-xs text-ink-soft">주유 챗봇 (이 화면)</dt>
          <dd className="mt-1 font-semibold">차를 모는 사람: 가격, 거리, 제도 변경, 주유 예보</dd>
        </div>
        <div className="rounded-2xl px-4 py-3 shadow-inset-sm">
          <dt className="text-xs text-ink-soft">{KEROSENE_APP.name}</dt>
          <dd className="mt-1 font-semibold">등유 보일러 가구: 소진 예측, AI 전화, 판매소, 군 현황판</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-sm font-semibold text-ink-soft">{KEROSENE_APP.name} 화면</h2>
      <ul className="mt-2.5 grid gap-3 sm:grid-cols-2">
        {KEROSENE_APP.screens.map((screen) => (
          <li key={screen.path}>
            <a
              href={`${KEROSENE_APP.url}${screen.path}`}
              className="block h-full rounded-2xl px-5 py-4 shadow-raised transition-shadow hover:shadow-raised-sm active:shadow-inset"
            >
              <span className="block font-semibold">{screen.title}</span>
              <span className="mt-0.5 block text-xs text-ink-soft">{screen.who}</span>
              <span className="mt-2 block text-sm leading-relaxed">{screen.body}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a
          href={KEROSENE_APP.url}
          className="rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent shadow-raised-sm transition-shadow hover:shadow-raised active:shadow-inset-sm"
        >
          {KEROSENE_APP.name} 열기
        </a>
        <Link href="/" className="rounded-full px-5 py-2.5 text-ink-soft shadow-raised-sm active:shadow-inset-sm">
          주유 챗봇으로 돌아가기
        </Link>
      </div>
      <p className="mt-4 text-xs text-ink-soft">
        {KEROSENE_APP.name}은 같은 팀(김형준·목서환)이 따로 만든 서비스예요. 가구와 판매소 정보는 시연용 가상 자료예요.
      </p>
    </section>
  );
}
