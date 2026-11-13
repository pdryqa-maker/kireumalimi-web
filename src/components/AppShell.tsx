"use client";

// 화면 틀: 넓은 화면은 왼쪽 메뉴, 휴대폰은 아래 탭. 위쪽에는 기관 로고와 내 위치·내 정보가 있다.
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signedIn } from "@/lib/profile";
import { BellIcon, ChatIcon, HomeHeatIcon, PinIcon, UserIcon } from "./icons";
import { useMounted, useProfile } from "./useStored";

const NAV = [
  { href: "/", label: "주유 챗봇", Icon: ChatIcon },
  { href: "/alerts", label: "내 알림", Icon: BellIcon },
  { href: "/kerosene", label: "등유 안심", Icon: HomeHeatIcon },
  { href: "/login", label: "내 정보", Icon: UserIcon },
];

// 한국석유공사 로고 파일(public/brand). 파일을 넣으면 크기와 함께 적는다.
const KNOC_LOGO: { src: string; width: number; height: number } | null = null;

function Avatar({ size = "size-9" }: { size?: string }) {
  const profile = useProfile();
  const mounted = useMounted();
  if (!mounted || !signedIn(profile)) {
    return (
      <span className={`grid ${size} place-items-center rounded-full text-ink-soft shadow-raised-sm`}>
        <UserIcon className="size-[18px]" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`grid ${size} place-items-center rounded-full bg-accent text-sm font-semibold text-on-accent`}>
      {profile.name.slice(0, 1)}
    </span>
  );
}

function PlaceChip() {
  const profile = useProfile();
  const mounted = useMounted();
  const place = mounted ? (profile.location?.label ?? profile.area?.name ?? null) : null;
  return (
    <Link
      href="/login"
      className="flex max-w-48 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-soft shadow-raised-sm hover:text-ink"
    >
      <PinIcon className="size-4 shrink-0 text-flame" />
      <span className="truncate">{place ?? "위치 설정"}</span>
    </Link>
  );
}

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const profile = useProfile();
  const mounted = useMounted();
  const loggedIn = mounted && signedIn(profile);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[5.5rem] shrink-0 flex-col items-center border-r border-hairline py-5 lg:flex">
        <Link href="/" aria-label="기름알리미 첫 화면">
          <Image src="/brand/yuilmui-mark.png" alt="팀 유일무이 로고" width={36} height={36} priority />
        </Link>
        <nav aria-label="주 메뉴" className="mt-8 flex flex-col gap-1.5">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(path, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex w-[4.25rem] flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] font-medium ${
                  active ? "bg-canvas text-ink" : "text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon className="size-[22px]" />
                {label}
              </Link>
            );
          })}
        </nav>
        <Link href="/login" aria-label={loggedIn ? `${profile.name}님 내 정보` : "간편 로그인"} className="mt-auto">
          <Avatar size="size-10" />
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 bg-ground/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
            {KNOC_LOGO && (
              <>
                <Image src={KNOC_LOGO.src} alt="한국석유공사" width={KNOC_LOGO.width} height={KNOC_LOGO.height} className="h-6 w-auto" priority />
                <span aria-hidden="true" className="h-4 w-px bg-hairline" />
              </>
            )}
            <Link href="/" className="flex items-center gap-2">
              <Image src="/brand/yuilmui-mark.png" alt="" width={26} height={26} className="lg:hidden" />
              <span className="text-[17px] font-bold tracking-tight">기름알리미</span>
            </Link>
            <div className="ml-auto flex items-center gap-2.5">
              <span className="hidden sm:block">
                <PlaceChip />
              </span>
              {loggedIn ? (
                <Link href="/login" aria-label={`${profile.name}님 내 정보`} className="lg:hidden">
                  <Avatar />
                </Link>
              ) : (
                <Link href="/login" className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
                  로그인
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">{children}</main>
        {/* 챗봇 화면은 입력창 아래에 같은 출처를 적으므로 여기서는 뺀다. */}
        {path !== "/" && (
          <footer className="px-4 pt-6 pb-28 text-center text-xs text-ink-soft lg:pb-5">
            유가 정보: 한국석유공사 오피넷 제공 · 공공데이터 활용 · 팀 유일무이
          </footer>
        )}

        <nav
          aria-label="주 메뉴"
          className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center justify-around rounded-full bg-ground/95 px-2 py-1.5 shadow-raised backdrop-blur lg:hidden"
        >
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(path, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-16 flex-col items-center gap-0.5 rounded-full px-3 py-1.5 text-[11px] font-medium ${
                  active ? "text-ink" : "text-ink-soft"
                }`}
              >
                <Icon className={`size-[22px] ${active ? "text-flame" : ""}`} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
