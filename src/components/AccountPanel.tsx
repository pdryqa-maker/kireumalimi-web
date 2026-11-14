"use client";

// 내 정보 화면의 계정 부분.
// - AccountTabs: 게스트가 보는 [로그인 | 가입하기] 탭
// - LoginBox: 로그인 탭. 아이디와 비밀번호만 받는다
// - SignupFields: 가입 탭 맨 위의 아이디·비밀번호 칸. 아래 내 정보 칸과 한 양식으로 함께 보낸다(LoginForm)
// - AccountActions: 로그인한 사람의 버튼 줄(로그아웃, 회원 탈퇴)
// 비밀번호 칸에는 지금까지 친 글자를 보여 주는 단추가 있다.
// 비밀번호 찾기는 없다(나중에 카카오톡 채널로 옮긴다). 화면에도 그 안내를 두지 않는다.
import { useId, useState } from "react";
import { logoutAccount, signIn, withdrawAccount } from "@/lib/accountSync";
import { savedLedgerAll } from "@/lib/savedLedger";
import { EyeIcon, EyeOffIcon } from "./icons";

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

export type AccountTab = "login" | "signup";
export type Credentials = { id: string; password: string; confirm: string };
export const NO_CREDENTIALS: Credentials = { id: "", password: "", confirm: "" };

export const cleanId = (id: string) => id.trim().toLowerCase();

// 가입할 때 아이디·비밀번호를 서버에 보내기 전에 본다. 맞으면 null, 틀리면 화면에 보일 문구.
export function checkCredentials({ id, password, confirm }: Credentials): string | null {
  if (!ID_RULE.test(cleanId(id))) return MESSAGES.badId;
  if (password.length < 8 || password.length > 64) return MESSAGES.badPassword;
  if (password !== confirm) return MESSAGES.mismatch;
  return null;
}

export const tabId = (base: string, tab: AccountTab) => `${base}-tab-${tab}`;
export const panelId = (base: string, tab: AccountTab) => `${base}-panel-${tab}`;

export function AccountTabs({ base, tab, onChoose }: { base: string; tab: AccountTab; onChoose: (tab: AccountTab) => void }) {
  return (
    <div role="tablist" aria-label="로그인 또는 가입" className="mt-6 inline-flex rounded-full bg-canvas p-1">
      {(["login", "signup"] as const).map((item) => (
        <button
          key={item}
          id={tabId(base, item)}
          type="button"
          role="tab"
          aria-selected={tab === item}
          aria-controls={panelId(base, item)}
          onClick={() => onChoose(item)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === item ? "bg-ground shadow-raised-sm" : "text-ink-soft"}`}
        >
          {item === "login" ? "로그인" : "가입하기"}
        </button>
      ))}
    </div>
  );
}

function IdInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm text-ink-soft">
        아이디
      </label>
      <input
        id={id}
        name="username"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        required
        placeholder={placeholder}
        className={`${FIELD} mt-1.5`}
      />
    </div>
  );
}

// 비밀번호 칸. 눈 모양 단추를 누르면 친 글자를 그대로 보여 주고, 다시 누르면 가린다.
function PasswordInput({
  id,
  name,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="text-sm text-ink-soft">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
          required
          placeholder={placeholder}
          className={`${FIELD} pr-14`}
        />
        <button
          type="button"
          onClick={() => setShown((on) => !on)}
          aria-pressed={shown}
          aria-controls={id}
          aria-label={`${label} 보기`}
          className="absolute inset-y-0 right-1.5 my-auto flex size-11 items-center justify-center rounded-full text-ink-soft focus-visible:outline-offset-0"
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

export function LoginBox() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await signIn("login", cleanId(id), password);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    // 성공하면 계정 상태가 바뀌어 이 칸은 내 정보 화면으로 바뀐다. 안내 한 줄이 뜨는 화면 위쪽으로 올린다
    window.scrollTo({ top: 0 });
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3" aria-label="로그인" noValidate>
      <IdInput id={`${ids}-id`} value={id} onChange={setId} />
      <PasswordInput id={`${ids}-pw`} name="password" label="비밀번호" value={password} onChange={setPassword} autoComplete="current-password" />
      {error && (
        <p role="alert" className="text-sm font-medium">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${PRIMARY} mt-1`}>
        {busy ? "확인하는 중…" : "로그인"}
      </button>
    </form>
  );
}

// 가입 탭 맨 위. 값은 LoginForm이 들고, 보낼 때 checkCredentials로 본다.
export function SignupFields({ value, onChange }: { value: Credentials; onChange: (next: Credentials) => void }) {
  const ids = useId();
  const set = (patch: Partial<Credentials>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="mt-6 space-y-3">
      <legend className="text-base font-semibold">아이디와 비밀번호</legend>
      <IdInput id={`${ids}-id`} value={value.id} onChange={(id) => set({ id })} placeholder="영문·숫자 4~20자" />
      <PasswordInput
        id={`${ids}-pw`}
        name="password"
        label="비밀번호"
        value={value.password}
        onChange={(password) => set({ password })}
        autoComplete="new-password"
        placeholder="8자 이상"
      />
      <PasswordInput
        id={`${ids}-confirm`}
        name="password-confirm"
        label="비밀번호 확인"
        value={value.confirm}
        onChange={(confirm) => set({ confirm })}
        autoComplete="new-password"
      />
    </fieldset>
  );
}

export function AccountActions() {
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
