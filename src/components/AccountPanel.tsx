"use client";

// 내 정보 화면의 계정 부분. part="top"은 머리말 아래(게스트: 로그인·가입 칸), part="actions"는 버튼 줄(로그아웃, 회원 탈퇴).
// 비밀번호 찾기는 없다(나중에 카카오톡 채널로 옮긴다). 화면에도 그 안내를 두지 않는다.
import { useId, useState } from "react";
import { logoutAccount, signIn, withdrawAccount } from "@/lib/accountSync";
import { savedLedgerAll } from "@/lib/savedLedger";
import { useAccount } from "./useAccount";

const FIELD =
  "w-full min-w-0 rounded-2xl bg-ground px-4 py-3 text-[15px] shadow-inset-sm placeholder:text-ink-soft focus-visible:outline-offset-1";
const BUTTON = "rounded-full px-4 py-2.5 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm disabled:opacity-50";
const PRIMARY = "rounded-full bg-accent px-6 py-3 font-semibold text-on-accent shadow-raised-sm disabled:opacity-50";

const ID_RULE = /^[a-z0-9]{4,20}$/;
const MESSAGES = {
  badId: "아이디는 영문과 숫자 4~20자로 만들어 주세요.",
  badPassword: "비밀번호는 8자 이상으로 만들어 주세요.",
  mismatch: "비밀번호 확인이 달라요.",
  unsynced: "아직 계정에 못 올린 기록이 있어요. 지금 로그아웃하면 이 기록은 사라져요.",
  logoutFailed: "로그아웃하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.",
  withdrawFailed: "탈퇴하지 못했어요. 잠시 뒤 다시 해 주세요.",
};

export default function AccountPanel({ part }: { part: "top" | "actions" }) {
  const account = useAccount();
  if (part === "top") {
    if (account.status === "unknown") return <div aria-hidden="true" className="mt-6 min-h-[19.5rem]" />;
    if (account.status === "unavailable") {
      return <p className="mt-6 rounded-2xl bg-canvas px-4 py-3 text-sm text-ink-soft">로그인 준비 중이에요.</p>;
    }
    if (account.status === "guest") return <SignInBox />;
    return null;
  }
  return account.status === "account" ? <AccountActions /> : null;
}

function SignInBox() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const signup = mode === "signup";

  function choose(next: "login" | "signup") {
    setMode(next);
    setError("");
    setConfirm("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const cleanId = id.trim().toLowerCase();
    if (signup) {
      if (!ID_RULE.test(cleanId)) return setError(MESSAGES.badId);
      if (password.length < 8 || password.length > 64) return setError(MESSAGES.badPassword);
      if (password !== confirm) return setError(MESSAGES.mismatch);
    }
    setBusy(true);
    setError("");
    const result = await signIn(mode, cleanId, password);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    // 성공하면 계정 상태가 바뀌어 이 칸은 내 정보 화면으로 바뀐다. 안내 한 줄이 뜨는 화면 위쪽으로 올린다
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="로그인 또는 가입" className="inline-flex rounded-full bg-canvas p-1">
        {(["login", "signup"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            onClick={() => choose(item)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${mode === item ? "bg-ground shadow-raised-sm" : "text-ink-soft"}`}
          >
            {item === "login" ? "로그인" : "가입하기"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-4 space-y-3" aria-label={signup ? "가입하기" : "로그인"} noValidate>
        <div>
          <label htmlFor={`${ids}-id`} className="text-sm text-ink-soft">
            아이디
          </label>
          <input
            id={`${ids}-id`}
            name="username"
            value={id}
            onChange={(event) => setId(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            required
            placeholder={signup ? "영문·숫자 4~20자" : undefined}
            className={`${FIELD} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-pw`} className="text-sm text-ink-soft">
            비밀번호
          </label>
          <input
            id={`${ids}-pw`}
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={signup ? "new-password" : "current-password"}
            maxLength={64}
            required
            placeholder={signup ? "8자 이상" : undefined}
            className={`${FIELD} mt-1.5`}
          />
        </div>
        {signup && (
          <div>
            <label htmlFor={`${ids}-confirm`} className="text-sm text-ink-soft">
              비밀번호 확인
            </label>
            <input
              id={`${ids}-confirm`}
              name="password-confirm"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              maxLength={64}
              required
              className={`${FIELD} mt-1.5`}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${PRIMARY} mt-1`}>
          {busy ? "확인하는 중…" : signup ? "가입하고 로그인" : "로그인"}
        </button>
      </form>
      <div className="mt-8 border-t border-hairline pt-6">
        <p className="text-sm leading-relaxed text-ink-soft">로그인하지 않아도 아래 내 정보를 이 브라우저에만 저장해 쓸 수 있어요.</p>
      </div>
    </div>
  );
}

function AccountActions() {
  const [busy, setBusy] = useState(false);
  const [logoutProblem, setLogoutProblem] = useState<"unsynced" | "failed" | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null); // 지울 주유 기록 수
  const [withdrawError, setWithdrawError] = useState("");

  async function logout(force: boolean) {
    setBusy(true);
    const result = await logoutAccount({ force });
    setBusy(false);
    setLogoutProblem(result.ok ? null : result.reason);
  }

  async function withdraw() {
    setBusy(true);
    setWithdrawError("");
    const result = await withdrawAccount();
    setBusy(false);
    if (!result.ok) setWithdrawError(MESSAGES.withdrawFailed);
  }

  return (
    <>
      <button type="button" disabled={busy} onClick={() => logout(false)} className={`${BUTTON} text-ink-soft`}>
        로그아웃
      </button>
      {logoutProblem && (
        <div role="alert" className="basis-full rounded-2xl bg-canvas px-4 py-3">
          <p className="text-sm">{logoutProblem === "unsynced" ? MESSAGES.unsynced : MESSAGES.logoutFailed}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => logout(false)} className={BUTTON}>
              다시 시도
            </button>
            {logoutProblem === "unsynced" && (
              <button type="button" disabled={busy} onClick={() => logout(true)} className={`${BUTTON} text-ink-soft`}>
                그래도 로그아웃
              </button>
            )}
          </div>
        </div>
      )}
      <div className="mt-6 basis-full border-t border-hairline pt-4">
        {confirming === null ? (
          <button type="button" onClick={() => setConfirming(savedLedgerAll().length)} className="text-xs text-ink-soft underline underline-offset-4">
            회원 탈퇴
          </button>
        ) : (
          <div role="group" aria-label="회원 탈퇴 확인" className="rounded-2xl bg-canvas px-4 py-3">
            <p className="text-sm">계정에 저장된 내 정보와 주유 기록 {confirming}건을 지워요. 되돌릴 수 없어요.</p>
            {withdrawError && (
              <p role="alert" className="mt-2 text-sm font-medium">
                {withdrawError}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={withdraw} className={BUTTON}>
                탈퇴하기
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(null)} className={`${BUTTON} text-ink-soft`}>
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
