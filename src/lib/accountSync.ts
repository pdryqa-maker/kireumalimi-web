// 브라우저 ↔ 계정 동기화. 화면은 지금처럼 브라우저 저장소를 읽고 쓰고, 여기서 다섯 저장소의 바뀜(`{키}:change`)을 들어 계정에 올린다.
// kireumalimi.sync에 { tag, dirty }를 둔다. tag는 이 브라우저의 사본이 어느 계정 것인지, dirty는 아직 못 올린 칸이다.
// 열 때와 창을 다시 볼 때(1분에 한 번까지) 계정을 받는다. 자세한 규칙은 docs/superpowers/specs/2026-11-14-account-login-design.md '동기화'.
import { STORE_KEYS, SYNC_FIELDS, type AccountData, type SyncField } from "./account/fields";
import { mergeAccount } from "./account/merge";
import { browserStore } from "./browserStore";
import { parseProfile, profileStore } from "./profile";
import { alertStore, parseAlerts } from "./savedAlerts";
import { fillStore, parseFills } from "./savedFills";
import { ledgerStore, parseLedger } from "./savedLedger";
import { parseWatch, watchStore } from "./watchSettings";

export type AccountState = { status: "unknown" | "unavailable" | "guest" | "account"; id: string; notice: string | null };

export const NOTICES = {
  merged: (n: number) => `이 브라우저에 있던 주유 기록 ${n}건을 계정에 합쳤어요.`,
  signedIn: "로그인했어요.",
  expired: "로그인 기간이 끝났어요. 다시 로그인하면 계정과 맞춰요.",
  loggedOut: "로그아웃했어요. 이 브라우저에서 내 정보와 기록을 지웠어요(계정에는 남아 있어요).",
  deleted: "탈퇴했어요. 계정의 내 정보와 기록을 모두 지웠어요.",
};

const STORES: Record<SyncField, { store: ReturnType<typeof browserStore>; parse: (raw: string) => unknown }> = {
  profile: { store: profileStore, parse: parseProfile },
  fills: { store: fillStore, parse: parseFills },
  ledger: { store: ledgerStore, parse: parseLedger },
  alerts: { store: alertStore, parse: parseAlerts },
  watch: { store: watchStore, parse: parseWatch },
};

// ── 동기화 상태(kireumalimi.sync) ────────────────────────────────

const SYNC_KEY = "kireumalimi.sync";
const syncStore = browserStore(SYNC_KEY, "{}");
type SyncState = { tag: string | null; dirty: SyncField[]; expired?: boolean }; // expired: '로그인 기간이 끝났어요'를 보였음

function readSync(): SyncState {
  try {
    const value = JSON.parse(syncStore.read());
    const dirty: unknown[] = Array.isArray(value?.dirty) ? value.dirty : [];
    return {
      tag: typeof value?.tag === "string" ? value.tag : null,
      dirty: SYNC_FIELDS.filter((field) => dirty.includes(field)),
      expired: value?.expired === true,
    };
  } catch {
    return { tag: null, dirty: [] };
  }
}
const writeSync = (sync: SyncState) => syncStore.write(sync);

// ── 화면에 주는 상태 ────────────────────────────────────────

const SERVER_STATE: AccountState = { status: "unknown", id: "", notice: null };
let state = SERVER_STATE;
const listeners = new Set<() => void>();
function setState(patch: Partial<AccountState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export const accountStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => state,
  getServerSnapshot: () => SERVER_STATE,
};

export const dismissNotice = () => setState({ notice: null });

// ── 브라우저 값 ──────────────────────────────────────────

let applying = 0; // 동기화가 스스로 쓰는 동안에는 바뀜을 dirty로 치지 않는다
function quietly(run: () => void) {
  applying++;
  try {
    run();
  } finally {
    applying--;
  }
}

const readLocal = (): AccountData =>
  Object.fromEntries(SYNC_FIELDS.map((field) => [field, STORES[field].parse(STORES[field].store.read())])) as AccountData;

const writeLocal = (data: AccountData) =>
  quietly(() => {
    for (const field of SYNC_FIELDS) if (data[field] !== undefined) STORES[field].store.write(data[field]);
  });

// 다섯 저장소와 동기화 상태를 지우고, 화면이 다시 그려지게 바뀜 이벤트를 보낸다.
function clearLocal() {
  cancelPush();
  quietly(() => {
    for (const key of [...Object.values(STORE_KEYS), SYNC_KEY]) {
      try {
        localStorage.removeItem(key);
      } catch {
      } finally {
        window.dispatchEvent(new Event(`${key}:change`));
      }
    }
  });
}

// ── 서버 호출 ──────────────────────────────────────────

let fetchImpl: typeof fetch = (...args) => fetch(...args);
let debounceMs = 1_500;

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try {
    const response = await fetchImpl(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, body: json && typeof json === "object" ? json : {} };
  } catch {
    return null; // 연결 끊김
  }
}

// 한 번에 하나씩 한다. 로그인 직후의 동기화가 그 전에 시작한 동기화에 묻히지 않게 줄을 세운다.
let chain: Promise<unknown> = Promise.resolve();
function queue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

// ── 올리기 ──────────────────────────────────────────────

let timer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
const editedDuringPush = new Set<SyncField>();

function cancelPush() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function schedulePush() {
  if (state.status !== "account") return;
  cancelPush();
  timer = setTimeout(() => {
    timer = null;
    void flushAccount();
  }, debounceMs);
}

function onLocalChange(field: SyncField) {
  if (applying) return;
  if (pushing) editedDuringPush.add(field);
  const sync = readSync();
  if (!sync.tag) return; // 게스트로 쓰는 브라우저는 셀 것이 없다(처음 로그인할 때 통째로 합친다)
  if (!sync.dirty.includes(field)) writeSync({ ...sync, dirty: [...sync.dirty, field] });
  schedulePush();
}

// 세션이 끝났다: 사본은 그대로 두고 안내를 한 번 보인다. 그동안 바꾼 칸은 dirty로 쌓인다.
function sessionEnded() {
  const sync = readSync();
  if (sync.tag && !sync.expired) {
    writeSync({ ...sync, expired: true });
    setState({ status: "guest", id: "", notice: NOTICES.expired });
  } else {
    setState({ status: "guest", id: "" });
  }
}

function accountGone() {
  clearLocal();
  setState({ status: "guest", id: "" });
}

// 보낸 칸을 dirty에서 뺀다. 올리는 사이 다시 바뀐 칸은 남겨 한 번 더 올린다.
function markPushed(tag: string, sent: SyncField[]) {
  const now = readSync();
  if (now.tag === tag) writeSync({ ...now, dirty: now.dirty.filter((field) => !sent.includes(field) || editedDuringPush.has(field)) });
  if (editedDuringPush.size) schedulePush();
}

async function pushDirty(): Promise<boolean> {
  cancelPush();
  const sync = readSync();
  if (!sync.tag || sync.dirty.length === 0) return true;
  if (state.status !== "account") return false;
  const local = readLocal();
  const sent = sync.dirty;
  pushing = true;
  editedDuringPush.clear();
  const result = await api("PUT", "/api/account", { tag: sync.tag, data: Object.fromEntries(sent.map((field) => [field, local[field]])) });
  pushing = false;
  if (result?.status === 200) {
    markPushed(sync.tag, sent);
    return true;
  }
  if (result?.status === 401) {
    if (result.body.deleted === true) accountGone();
    else sessionEnded();
  } else if (result?.status === 409) {
    void syncNow(); // 이 사본은 지금 로그인한 계정 것이 아니다. 받기에서 다른 계정 사본을 비우고 합친다
  }
  return false;
}

export const flushAccount = () => queue(pushDirty).catch(() => false);

// ── 받기와 처음 로그인할 때 합치기 ─────────────────────────────

let lastSync = 0;

async function runSync() {
  lastSync = Date.now();
  const result = await api("GET", "/api/account");
  if (!result) return; // 연결이 안 되면 아무것도 바꾸지 않는다
  if (result.status === 401) {
    if (result.body.deleted === true) accountGone(); // 다른 기기에서 탈퇴했거나 1년 동안 안 써서 지워졌다
    return;
  }
  if (result.status !== 200) return; // 503 등: 아무것도 지우지 않는다
  if (result.body.enabled === false) {
    setState({ status: "unavailable", id: "" });
    return;
  }
  const account = result.body.account as { id: string; tag: string } | null;
  if (!account) {
    sessionEnded();
    return;
  }
  const remote = (result.body.data ?? {}) as AccountData;
  const sync = readSync();

  if (sync.tag === account.tag) {
    // 같은 계정: 바꾸지 않은 칸은 계정 값으로, 바꾼 칸은 올린다
    const dirty = new Set(sync.dirty);
    const local = readLocal();
    quietly(() => {
      for (const field of SYNC_FIELDS) {
        if (dirty.has(field) || remote[field] === undefined) continue;
        if (JSON.stringify(local[field]) !== JSON.stringify(remote[field])) STORES[field].store.write(remote[field]);
      }
    });
    if (sync.expired) writeSync({ tag: sync.tag, dirty: sync.dirty });
    setState({ status: "account", id: account.id });
    if (sync.dirty.length) await pushDirty();
    return;
  }

  // 처음 로그인(tag 없음) 또는 다른 계정의 사본(tag 다름). 다른 계정의 기록은 섞지 않는다
  if (sync.tag) clearLocal();
  const { merged, addedFills } = mergeAccount(readLocal(), remote);
  writeLocal(merged);
  setState({ status: "account", id: account.id });
  pushing = true;
  editedDuringPush.clear();
  const put = await api("PUT", "/api/account", { tag: account.tag, data: merged });
  pushing = false;
  if (put?.status !== 200) return; // tag를 저장하지 않으므로 다음에 열 때 다시 합친다(여러 번 해도 결과가 같다)
  writeSync({ tag: account.tag, dirty: [...editedDuringPush] });
  if (editedDuringPush.size) schedulePush();
  setState({ notice: addedFills > 0 ? NOTICES.merged(addedFills) : NOTICES.signedIn });
}

export const syncNow = (): Promise<void> => queue(runSync).catch(() => undefined);

// ── 시작 ────────────────────────────────────────────────

let started = false;

function readUrlNotice() {
  try {
    const url = new URL(location.href);
    const kind = url.searchParams.get("account");
    if (kind === null) return;
    url.searchParams.delete("account");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    if (kind === "loggedout") setState({ notice: NOTICES.loggedOut });
    if (kind === "deleted") setState({ notice: NOTICES.deleted });
  } catch {}
}

export function startAccountSync(opts: { fetch?: typeof fetch; debounceMs?: number } = {}) {
  if (started) return;
  started = true;
  if (opts.fetch) fetchImpl = opts.fetch;
  if (opts.debounceMs !== undefined) debounceMs = opts.debounceMs;
  readUrlNotice();
  for (const field of SYNC_FIELDS) window.addEventListener(`${STORE_KEYS[field]}:change`, () => onLocalChange(field));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushAccount(); // 창을 떠날 때 미뤄 둔 올리기를 바로 한다
    else if (Date.now() - lastSync >= 60_000) void syncNow();
  });
  void syncNow();
}

// ── 로그인·로그아웃·탈퇴 ─────────────────────────────────────

const go = (url: string) => location.assign(url);

export async function signIn(mode: "login" | "signup", id: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await api("POST", `/api/auth/${mode}`, { id, password });
  if (!result) return { ok: false, error: "인터넷 연결을 확인하고 다시 해 주세요." };
  if (result.status !== 200) {
    return { ok: false, error: typeof result.body.error === "string" ? result.body.error : "잠시 뒤 다시 해 주세요." };
  }
  await syncNow();
  return { ok: true };
}

// 못 올린 칸이 있으면 먼저 올린다(세션 쿠키가 있어야 올릴 수 있다). 못 올렸으면 force 없이는 지우지 않고 묻는다.
export async function logoutAccount({ force, navigate = go }: { force: boolean; navigate?: (url: string) => void }): Promise<
  { ok: true } | { ok: false; reason: "unsynced" | "failed" }
> {
  if (!force) {
    const pushed = await flushAccount();
    if (!pushed || readSync().dirty.length > 0) return { ok: false, reason: "unsynced" };
  }
  const result = await api("POST", "/api/auth/logout");
  if (result?.status !== 200) return { ok: false, reason: "failed" }; // 쿠키가 남으면 다음에 열 때 다시 받아 오므로 지우지 않는다
  clearLocal();
  setState({ status: "guest", id: "", notice: null });
  navigate("/?account=loggedout");
  return { ok: true };
}

export async function withdrawAccount({ navigate = go }: { navigate?: (url: string) => void } = {}): Promise<{ ok: boolean }> {
  const result = await api("DELETE", "/api/account");
  if (result?.status !== 200) return { ok: false };
  clearLocal();
  setState({ status: "guest", id: "", notice: null });
  navigate("/?account=deleted");
  return { ok: true };
}
