"use client";

// 대시보드 안 결과 패널. 넓은 화면(lg 이상)은 오른쪽에 붙은 열, 휴대폰은 아래에서 올라오는 창(시트)이다.
// 안의 대화(ChatPanel)는 하나만 두고 화면 너비에 따라 겉모양만 바꾼다. 그래서 시트를 닫았다 열어도 대화가 남는다.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const DESKTOP = "(min-width: 64rem)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// lg 이상인지. 서버에서 그릴 때는 휴대폰으로 친다.
export function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

// 패널 상태: 열림, 대화가 답을 준비하는 중인지(busy), 대화가 있는지. ChatPanel의 onActivity에 그대로 넘긴다.
export function usePanelState() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const onActivity = useCallback((state: { busy: boolean; hasMessages: boolean }) => {
    setBusy(state.busy);
    setHasResult(state.hasMessages);
    // 사진이나 입력창 질문으로 답을 준비하기 시작하면 패널을 연다.
    if (state.busy) setOpen(true);
  }, []);
  const openPanel = useCallback(() => setOpen(true), []);
  const closePanel = useCallback(() => setOpen(false), []);
  return { open, busy, hasResult, onActivity, openPanel, closePanel };
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function DashboardPanel({
  open,
  onOpen,
  onClose,
  label,
  hasResult,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  label: string;
  // 패널에 대화가 있는지(휴대폰 알약 버튼 글: 결과 보기 / 물어보기)
  hasResult: boolean;
  children: React.ReactNode;
}) {
  const desktop = useIsDesktop();
  const sheetOpen = open && !desktop;
  const closeRef = useRef<HTMLButtonElement>(null);

  // 휴대폰 시트: 열리면 닫기 버튼으로 초점을 옮기고, Esc로 닫고, 뒤 화면이 같이 스크롤되지 않게 한다.
  useEffect(() => {
    if (!sheetOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [sheetOpen, onClose]);

  return (
    <>
      {sheetOpen && <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-ink/30 lg:hidden" />}
      {!open && !desktop && (
        <button
          type="button"
          onClick={onOpen}
          className="fixed right-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.5rem)] z-30 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent shadow-raised lg:hidden"
        >
          {hasResult ? "결과 보기" : "물어보기"}
        </button>
      )}
      <section
        aria-label={label}
        role={desktop ? undefined : "dialog"}
        aria-modal={sheetOpen ? true : undefined}
        className={[
          "flex flex-col bg-ground",
          // 휴대폰: 아래에서 올라오는 시트. 탭 막대 위에 덮여 입력창이 탭 막대에 가리지 않는다.
          "fixed inset-x-0 bottom-0 z-50 h-[85dvh] rounded-t-3xl px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-raised duration-300",
          // 열 때는 바로 보이게 해 닫기 버튼으로 초점을 옮길 수 있고, 닫을 때는 내려간 뒤에 숨긴다.
          open ? "visible translate-y-0 transition-[translate]" : "invisible translate-y-full transition-[translate,visibility]",
          // 넓은 화면: 오른쪽에 붙은 열. 대시보드를 스크롤해도 화면에 남는다.
          "lg:visible lg:sticky lg:top-[4.5rem] lg:self-start lg:z-auto lg:mt-6 lg:h-[calc(100dvh-6rem)] lg:translate-y-0 lg:rounded-3xl lg:px-5 lg:pt-4 lg:pb-4 lg:transition-none",
        ].join(" ")}
      >
        <div aria-hidden="true" className="mx-auto mb-1 h-1 w-10 rounded-full bg-hairline lg:hidden" />
        <div className="flex items-center justify-between gap-3 pb-2">
          <h2 className="text-sm font-semibold text-ink-soft">{label}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="결과 창 닫기"
            className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-canvas lg:hidden"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </section>
    </>
  );
}
