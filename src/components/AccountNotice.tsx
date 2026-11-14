"use client";

// 로그인·로그아웃·탈퇴·로그인 기간 끝남 안내 한 줄. 화면 위쪽에 한 번 보이고 8초 뒤 저절로 닫힌다.
import { useEffect } from "react";
import { dismissNotice } from "@/lib/accountSync";
import { useAccount } from "./useAccount";

const SHOW_MS = 8_000;

export default function AccountNotice() {
  const { notice } = useAccount();
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(dismissNotice, SHOW_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div role="status" aria-live="polite" className="empty:hidden">
      {notice && (
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-canvas px-4 py-3 text-sm">
          <p className="flex-1 leading-relaxed">{notice}</p>
          <button type="button" onClick={dismissNotice} aria-label="안내 닫기" className="-my-1 -mr-1 rounded-full px-2 py-1 text-ink-soft">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
