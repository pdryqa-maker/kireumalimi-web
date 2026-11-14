// 계정 API의 본체. 라우트는 호출 제한만 하고 여기로 넘긴다. Deps를 받아 메모리 Redis와 시계로 서버 없이 시험한다.
// 로그에는 아이디나 비밀번호를 남기지 않는다. 저장소 오류만 console.warn으로 남긴다.
import { accountConfig, type AccountConfig } from "./config";
import { clearCookieHeader, cookieHeader, readCookie } from "./cookies";
import { accountKey, failKey, REDIS_TTL } from "./fields";
import { cleanLoginId, hashPassword, isPassword, PASSWORD_LIMITS, verifyPassword, type PasswordHash } from "./password";
import { redisFor, RedisError, type Redis } from "./redis";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession, type Session } from "./session";

export type Deps = { config: AccountConfig | null; redis: Redis | null; now: () => number };

let cached: Deps | null = null;
export function defaultDeps(): Deps {
  if (!cached) {
    const config = accountConfig();
    cached = { config, redis: config ? redisFor(config) : null, now: Date.now };
  }
  return cached;
}

export const MESSAGES = {
  badId: "아이디는 영문과 숫자 4~20자로 만들어 주세요.",
  badPassword: "비밀번호는 8자 이상으로 만들어 주세요.",
  taken: "이미 쓰는 아이디예요.",
  wrong: "아이디나 비밀번호가 맞지 않아요.",
  locked: "로그인 시도가 많아요. 10분 뒤 다시 해 주세요.",
  notReady: "로그인 준비 중이에요.",
  storeDown: "계정 서버에 잠시 연결하지 못했어요. 잠시 뒤 다시 해 주세요.",
  badRequest: "요청 형식이 맞지 않아요.",
  forbidden: "이 주소에서 보낸 요청만 받아요.",
  signedOut: "로그인이 필요해요.",
};

const LOCK_MAX = 5; // 10분 동안 이만큼 틀리면 잠근다
const LOCK_SECONDS = 600;
const MAX_AUTH_BODY = 2_048;

export const fail = (status: number, error: string, headers?: HeadersInit) => Response.json({ error }, { status, headers });

export const isSecure = (request: Request) =>
  new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

// 바꾸는 요청은 우리 화면에서 보낸 것만 받는다. 브라우저는 POST·PUT·DELETE에 Origin을 붙인다.
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const own = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  return host === own || host === new URL(request.url).host;
}

export async function currentSession(request: Request, deps: Deps): Promise<Session | null> {
  if (!deps.config) return null;
  return verifySession(readCookie(request, SESSION_COOKIE), deps.config.secret, Math.floor(deps.now() / 1000));
}

async function sessionCookie(request: Request, id: string, deps: Deps & { config: AccountConfig }) {
  const iat = Math.floor(deps.now() / 1000);
  const token = await signSession({ sub: id, iat, exp: iat + SESSION_MAX_AGE }, deps.config.secret);
  return cookieHeader(SESSION_COOKIE, token, { maxAge: SESSION_MAX_AGE, secure: isSecure(request) });
}

// 본문을 { id, password } 꼴 객체로 읽는다. 너무 길거나 JSON 객체가 아니면 null.
async function readCredentials(request: Request): Promise<{ id: unknown; password: unknown } | null> {
  const text = await request.text().catch(() => "");
  if (text.length > MAX_AUTH_BODY) return null;
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return { id: body.id, password: body.password };
  } catch {
    return null;
  }
}

// 설정·Origin·저장소 오류를 한곳에서 처리한다.
export async function guarded(
  request: Request,
  deps: Deps,
  run: (deps: Deps & { config: AccountConfig; redis: Redis }) => Promise<Response>,
): Promise<Response> {
  if (!sameOrigin(request)) return fail(403, MESSAGES.forbidden);
  if (!deps.config || !deps.redis) return fail(503, MESSAGES.notReady);
  try {
    return await run(deps as Deps & { config: AccountConfig; redis: Redis });
  } catch (error) {
    if (!(error instanceof RedisError)) throw error;
    console.warn("[account] 저장소 오류:", error.message);
    return fail(503, MESSAGES.storeDown);
  }
}

export function signup(request: Request, deps: Deps) {
  return guarded(request, deps, async (ready) => {
    const body = await readCredentials(request);
    if (!body) return fail(400, MESSAGES.badRequest);
    const id = cleanLoginId(body.id);
    if (!id) return fail(400, MESSAGES.badId);
    if (!isPassword(body.password)) return fail(400, MESSAGES.badPassword);

    const key = accountKey(id);
    const auth = await hashPassword(body.password);
    if (!(await ready.redis.hsetnx(key, "auth", JSON.stringify(auth)))) return fail(409, MESSAGES.taken);
    const now = ready.now();
    await ready.redis.hset(key, { meta: JSON.stringify({ createdAt: now, updatedAt: now }) });
    await ready.redis.expire(key, REDIS_TTL);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": await sessionCookie(request, id, ready) } });
  });
}

// 없는 아이디도 해시 비교를 한 번 해서, 걸린 시간으로 아이디가 있는지 드러나지 않게 한다.
let dummyHash: Promise<PasswordHash> | null = null;
const dummy = () => (dummyHash ??= hashPassword(crypto.randomUUID()));

export function login(request: Request, deps: Deps) {
  return guarded(request, deps, async (ready) => {
    const body = await readCredentials(request);
    if (!body || typeof body.password !== "string") return fail(400, MESSAGES.badRequest);
    const id = cleanLoginId(body.id);
    if (!id) return fail(401, MESSAGES.wrong); // 이런 아이디로는 가입할 수 없으니 셀 필요도 없다

    // 시도를 먼저 센다. 맞으면 지우므로 결국 틀린 횟수만 남는다. 잠긴 동안의 시도도 10분을 다시 잰다.
    const tries = await ready.redis.incr(failKey(id));
    if (tries === 1 || tries > LOCK_MAX) await ready.redis.expire(failKey(id), LOCK_SECONDS);
    if (tries > LOCK_MAX) return fail(429, MESSAGES.locked);

    const stored = await ready.redis.hgetall(accountKey(id));
    let auth: unknown = null;
    try {
      auth = stored?.auth ? JSON.parse(stored.auth) : null;
    } catch {}
    const matched = await verifyPassword(body.password.slice(0, PASSWORD_LIMITS.max), auth ?? (await dummy()));
    if (!auth || !matched || body.password.length > PASSWORD_LIMITS.max) return fail(401, MESSAGES.wrong);

    await ready.redis.del(failKey(id));
    return Response.json({ ok: true }, { headers: { "Set-Cookie": await sessionCookie(request, id, ready) } });
  });
}

// 설정이 없어도 쿠키는 지운다.
export async function logout(request: Request) {
  if (!sameOrigin(request)) return fail(403, MESSAGES.forbidden);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookieHeader(SESSION_COOKIE, { secure: isSecure(request) }) } });
}
