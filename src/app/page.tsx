import Link from "next/link";

const SERVICES = [
  {
    href: "/kerosene",
    title: "등유 안심",
    description: "기름이 떨어지기 전에 어르신께 먼저 전화하고, 주문까지 도와드려요.",
  },
  {
    href: "/chat",
    title: "주유 챗봇",
    description: "근처 주유소와 지난 고시 뒤 우리 동네 가격 변화를 물어보세요.",
  },
];

export default function Home() {
  return (
    <>
      <h1 className="text-3xl font-bold">기름이 떨어지기 전에, 먼저 알려 드려요</h1>
      <p className="mt-3 text-foreground/70">고유가 시대를 함께 건너는 AI 기름알리미</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SERVICES.map((service) => (
          <Link
            key={service.href}
            href={service.href}
            className="rounded-lg border border-foreground/15 p-6 hover:border-foreground/40"
          >
            <h2 className="text-lg font-semibold">{service.title}</h2>
            <p className="mt-2 text-sm text-foreground/70">{service.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
