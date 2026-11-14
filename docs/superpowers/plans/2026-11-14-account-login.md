# 아이디·비밀번호 계정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이디·비밀번호로 가입·로그인·로그아웃·탈퇴하고, 로그인한 사람의 내 정보·주유 기록·알림 설정이 기기를 바꿔도 따라오게 한다.

**Architecture:**
- 서버: 라우트 핸들러가 가입·로그인을 처리한다. 비밀번호는 scrypt 해시로, 로그인 상태는 HMAC 서명 세션 쿠키로 둔다. 계정 데이터는 Redis 해시 `acct:{아이디}`에 칸별 JSON으로 둔다. Redis는 운영에서는 Upstash REST(fetch), 개발에서 값이 없으면 `.data/accounts.json` 파일이다.
- 브라우저: 화면은 지금의 localStorage 저장소를 그대로 쓴다. `accountSync`가 다섯 저장소의 `:change` 이벤트를 듣고 계정에 올리며, 열 때 계정에서 받아 온다.
- 핸들러는 설정·Redis·시계를 인자로 받는 함수로 짠다. route.ts는 기본값을 넣어 부르기만 한다. 그래서 node 스크립트로 서버 없이 시험한다.

**Tech Stack:** Next.js 16.4 라우트 핸들러(Web Request/Response, Node 런타임), `node:crypto` scrypt, Web Crypto HMAC-SHA256, Upstash Redis REST, React 19 `useSyncExternalStore`, Tailwind 4, Node 26 type stripping 시험.

**Spec:** `docs/superpowers/specs/2026-11-14-account-login-design.md`

## Global Constraints
- 새 npm 의존성은 넣지 않는다.
- 시크릿은 `.env.local`과 Vercel 환경변수에만 둔다. 원문 비밀번호는 로그·응답·브라우저 저장소에 남기지 않는다.
- 환경변수: `AUTH_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. 없으면 `KV_REST_API_URL`, `KV_REST_API_TOKEN`을 읽는다.
- 개발 대체 저장(`NODE_ENV !== "production"`이고 값이 없을 때만)
  - 저장 파일 `{cwd}/.data/accounts.json`
  - 시크릿 `{cwd}/.data/secret`(없으면 32바이트 무작위로 만든다)
  - `.data/`는 `.gitignore`에 넣는다.
- 동기화하는 브라우저 키: `kireumalimi.profile`, `.fills`, `.ledger`, `.alerts`, `.watch`. 계정 칸 이름은 `profile`, `fills`, `ledger`, `alerts`, `watch`. 동기화 상태 키는 `kireumalimi.sync`.
- 세션 쿠키 `kireumalimi_session`: httpOnly, SameSite=Lax, https면 Secure, Path=/, 30일(2,592,000초).
- 아이디는 `/^[a-z0-9]{4,20}$/`(소문자로 바꾼 뒤 검사), 비밀번호는 8~64자.
- scrypt 설정: N=32768, r=8, p=1, 솔트 16바이트, 결과 32바이트, maxmem 64MiB.
- 로그인 실패 잠금: `fail:{id}`를 INCR하고 처음 실패 때 EXPIRE 600초. 5번 넘으면 429.
- Redis 키 만료는 1년(31,536,000초)이고 읽거나 쓸 때마다 다시 건다. 칸 하나는 65,536바이트까지.
- 호출 제한(`src/lib/rateLimit.ts` LIMITS): `auth` 10분에 30번, `account` 10분에 120번.
- 바꾸는 요청(가입, 로그인, 로그아웃, PUT, DELETE)은 `Origin === new URL(request.url).origin`일 때만 받는다. 아니면 403.
- 화면 문구와 오류 문구는 설계 문서에 적힌 그대로 쓴다. 비밀번호 찾기·재설정 안내는 어디에도 넣지 않는다.
- 기존 검사 함수를 다시 쓴다: `cleanProfile`, `parseFills`, `cleanLedger(…, MAX_SAVED_LEDGER)`, `parseAlerts`, `parseWatch`.
- `signedIn(profile)`의 이름과 동작은 바꾸지 않는다. 고치지 않는 파일: ChatPanel.tsx, ConditionBar.tsx, chatbot.ts.
- 커밋 작성자: `git -c user.name="배재원" -c user.email="273242562+jaewonbbae@users.noreply.github.com"`. 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 시험
  - 위치: 저장소 밖 `$T` = `/private/tmp/claude-501/-Users-jaewon-Desktop--26-UNIST-------------AI----------/4051cbe8-5982-4651-968e-9452ae1f4920/scratchpad/apptest`
  - 실행: `APP_ROOT=$R node --import $T/register.mjs $T/<name>.mjs`. `$R`은 `…/scratchpad/acct`.
  - `register.mjs`·`hooks.mjs`는 기존 apptest에서 복사한다.
  - 매 작업 끝에 `npx tsc --noEmit`과 바꾼 파일의 eslint가 통과해야 한다.

## Review Focus
1. **두 탭에서 로그아웃 뒤 다른 계정으로 로그인**: 앞 탭에 대기 중이던 올리기는 409로 거절되고 새 계정은 그대로다 → Task 5 `put-wrong-tag-409`.
2. **비밀번호를 계속 넣어 보기**: 5번 넘게 틀리면 맞는 비밀번호도 10분 동안 429다. 없는 아이디도 같은 응답 → Task 4 `login-lockout`, `login-unknown-id-same-message`.
3. **Redis가 죽거나 5xx**: GET은 503이고, 브라우저는 아무것도 지우지 않고 dirty를 남긴다 → Task 5 `get-redis-down-503`, Task 6 `sync-server-down-keeps-local`.
4. **망가진 본문**(JSON 아님, 64KB 넘음, 모르는 칸, `auth`·`meta` 칸 덮어쓰기 시도): 400 또는 413이고 아무것도 저장하지 않는다 → Task 5 `put-*`.
5. **값 없이 배포된 운영**: `/api/account`는 `{enabled:false}`, 가입·로그인은 503 "로그인 준비 중이에요."이고 화면은 '준비 중'이다. 게스트 기능은 그대로 → Task 1 `config-prod-missing-null`, Task 4 `signup-unconfigured`, Task 7 확인.

---

### Task 1: 설정, 세션 서명, 쿠키, 비밀번호 해시

**Files:**
- Create: `src/lib/account/config.ts`, `src/lib/account/session.ts`, `src/lib/account/cookies.ts`, `src/lib/account/password.ts`
- Modify: `.gitignore`(`/.data/` 더함)
- Test: `$T/acct-core.mjs`(+ `register.mjs`, `hooks.mjs` 복사)

**Interfaces:**
- Produces:
  - `type AccountConfig = { secret: string; store: { kind: "rest"; url: string; token: string } | { kind: "file"; path: string } }`
  - `accountConfig(env?: Record<string, string | undefined>, cwd?: string): AccountConfig | null`
    - 운영: AUTH_SECRET(32자 이상)과 REST 값 둘이 다 있어야 하고, 아니면 null.
    - 개발: 없는 것을 `.data/`로 채운다.
  - `type Session = { sub: string; iat: number; exp: number }`(초)
  - `signSession(s: Session, secret: string): Promise<string>`, `verifySession(token: string | undefined, secret: string, nowSec: number): Promise<Session | null>`
  - `accountTag(id: string, createdAt: number, secret: string): Promise<string>`(hex 16자), `safeEqual(a: string, b: string): boolean`
  - `SESSION_COOKIE = "kireumalimi_session"`, `SESSION_MAX_AGE = 2_592_000`
  - `readCookie(request: Request, name: string): string | undefined`
  - `cookieHeader(name, value, { maxAge, secure }): string`(HttpOnly; SameSite=Lax; Path=/), `clearCookieHeader(name, { secure }): string`
  - `type PasswordHash = { alg: "scrypt"; N: number; r: number; p: number; salt: string; hash: string }`
  - `hashPassword(password: string): Promise<PasswordHash>`, `verifyPassword(password: string, stored: unknown): Promise<boolean>`(형식이 틀리면 false)
  - `cleanLoginId(value: unknown): string | null`, `isPassword(value: unknown): value is string`

- [ ] **Step 1: 실패하는 시험을 쓴다**
  - `sign-verify-roundtrip`
  - `verify-rejects-tampered`, `verify-rejects-other-secret`, `verify-rejects-expired`(`nowSec >= exp`), `verify-rejects-garbage`(`undefined`, `""`, `"a.b.c"`)
  - `tag-stable-and-distinct`: createdAt이나 id가 다르면 값이 다르다
  - `cookie-header`: HttpOnly, SameSite=Lax, Path=/, Max-Age가 있다. secure:true일 때만 Secure
  - `read-cookie`: `a=1; kireumalimi_session=tok%2E; b=2` → `"tok."`
  - `password-roundtrip`: 맞으면 true, 한 글자 다르면 false. 같은 비밀번호를 두 번 해시하면 솔트가 다르다. 결과 JSON에 원문이 없다
  - `password-bad-stored-false`: `null`, `{}`, `{alg:"md5"}` → false
  - `login-id-rules`: `"Jaewon99"` → `"jaewon99"`. `"abc"`, `"재원1234"`, `"a".repeat(21)`, `"ab_cd"` → null
  - `password-rules`: 7자는 false, 8자와 64자는 true, 65자는 false
  - `config-prod-missing-null`: production에서 AUTH_SECRET이나 REST 값 하나가 없으면 null. KV_* 이름만 있어도 rest 설정이 된다
  - `config-dev-file-fallback`: development에서 값이 없으면 임시 cwd에 `.data/secret`이 생긴다. kind는 file이고, 두 번 불러도 같은 secret이다
- [ ] **Step 2: 실행해 실패를 본다.**
- [ ] **Step 3: 네 파일을 만들고 `.gitignore`를 고친다.** HMAC은 `crypto.subtle`, base64url은 `btoa`/`atob` + TextEncoder, scrypt는 `node:crypto`의 `scrypt`(promisify).
- [ ] **Step 4: 통과를 본다.** tsc, eslint.
- [ ] **Step 5: 커밋** `feat(account): 설정·세션·쿠키·비밀번호 해시`

### Task 2: Redis(Upstash REST·개발용 파일)와 계정 칸 검사

**Files:**
- Create: `src/lib/account/redis.ts`, `src/lib/account/fields.ts`
- Test: `$T/acct-store.mjs`, `$T/memRedis.mjs`(시험용 메모리 Redis, 이후 작업이 같이 쓴다)

**Interfaces:**
- Produces:
  - `type Redis = { hgetall(key): Promise<Record<string, string> | null>; hset(key, fields: Record<string, string>): Promise<void>; hsetnx(key, field, value): Promise<boolean>; del(...keys: string[]): Promise<void>; expire(key, seconds): Promise<void>; incr(key): Promise<number> }`
  - `class RedisError extends Error`
  - `restRedis(url: string, token: string, fetchImpl?: typeof fetch): Redis`
    - `POST {url}`, `Authorization: Bearer {token}`, 본문은 명령 배열이다.
    - `{result}`를 쓰고, `{error}`나 2xx가 아니거나 fetch가 던지면 RedisError.
    - HGETALL 배열을 객체로 바꾸고, 빈 배열이면 null.
  - `fileRedis(path: string, now?: () => number): Redis`
    - 파일 하나에 `{ [key]: { type: "hash" | "num", value, expiresAt } }`로 둔다.
    - 만료된 키는 읽을 때 없는 것으로 본다.
    - 쓰기는 임시 파일에 쓴 뒤 rename한다.
  - `redisFor(config: AccountConfig): Redis`
  - `SYNC_FIELDS = ["profile","fills","ledger","alerts","watch"] as const`, `type SyncField`, `STORE_KEYS: Record<SyncField, string>`
  - `type AccountData = Partial<{ profile: Profile; fills: FillRecord[]; ledger: LedgerEntry[]; alerts: SavedAlert[]; watch: Watch }>`
  - `cleanField(field: SyncField, value: unknown): unknown`. fills는 parseFills 결과를 날짜순으로 정렬해 최근 `MAX_RECORDS`개만 둔다.
  - `parseStored(hash: Record<string, string>): AccountData`: `auth`·`meta`와 깨진 칸은 뺀다.
  - `MAX_FIELD_BYTES = 65_536`, `REDIS_TTL = 31_536_000`, `accountKey(id) => "acct:" + id`, `failKey(id) => "fail:" + id`
- 시험용 `memRedis()`는 `Redis`를 만족하고 `dump()`와 `fail(on: boolean)`을 준다.

- [ ] **Step 1: 실패하는 시험을 쓴다**
  - `rest-hgetall-to-object`: 보낸 본문이 `["HGETALL","acct:a"]`이고 Bearer 머리글이 붙는다. 빈 배열이면 null
  - `rest-hset-flattens`: `["HSET","k","a","1","b","2"]`
  - `rest-error-throws`: 500, `{error}`, fetch 예외 → RedisError
  - `file-roundtrip`: 임시 경로에서 hset·hgetall·hsetnx(이미 있으면 false)·incr(1, 2)·del. 새 fileRedis로 다시 열어도 값이 남아 있다
  - `file-expire`: now를 600초 뒤로 옮기면 expire(…,600)한 키가 없다
  - `clean-profile-defaults`: `cleanField("profile",{fuel:"우유"})`이면 유종 `"휘발유"`
  - `clean-fills-cap`: 7개 → 날짜순 최근 5개
  - `clean-ledger-cap`: 120개 → 100개
  - `parse-stored-skips-auth-meta-broken`: `{auth:"{…}", meta:"{…}", profile:"{", ledger:"[]"}` → `{ledger:[]}`
- [ ] **Step 2: 실행해 실패를 본다.**
- [ ] **Step 3: 두 파일과 `memRedis.mjs`를 만든다.**
- [ ] **Step 4: 통과를 본다.** tsc, eslint.
- [ ] **Step 5: 커밋** `feat(account): Redis 연결과 계정 칸 검사`

### Task 3: 처음 로그인할 때 합치기

**Files:**
- Create: `src/lib/account/merge.ts`
- Test: `$T/acct-merge.mjs`

**Interfaces:**
- Consumes: `AccountData`(Task 2), `GUEST`(profile.ts), `MAX_RECORDS`, `MAX_SAVED_LEDGER`, `MAX_ALERTS`
- Produces:
  - `isFilledProfile(p: Profile): boolean`: `{...p, name:""}`와 `GUEST`의 JSON이 다르면 true
  - `anyWatch(w: Watch): boolean`
  - `mergeAccount(local: AccountData, remote: AccountData): { merged: Required<AccountData>; addedFills: number }`
    - 설계 문서 '처음 로그인할 때 합치기' 2의 규칙을 따른다. 이름은 계정 → 브라우저 순으로 고른다.
    - alerts는 같은 조건이면 계정 쪽을 남기고, id 순으로 정렬해 최근 5개.
    - `addedFills`는 브라우저 (ledger ∪ fills) 날짜 가운데 계정 (ledger ∪ fills)에 없던 날짜의 수.

- [ ] **Step 1: 실패하는 시험을 쓴다**
  - `empty-remote-takes-local`: addedFills = 브라우저 날짜 수
  - `filled-remote-profile-wins`
  - `default-remote-profile-loses`: 계정 `{...GUEST, name:"재원"}`, 브라우저에 경유·위치 → 브라우저 값에 이름 "재원"
  - `ledger-same-date-remote-wins`: 결과는 날짜순
  - `fills-cap-5`
  - `alerts-dedupe-cap-5`
  - `watch-all-false-remote-loses`
  - `idempotent`: `mergeAccount(merged, merged)`는 같은 merged를 주고 addedFills는 0
- [ ] **Step 2: 실행해 실패를 본다.**
- [ ] **Step 3: `merge.ts`를 만든다.**
- [ ] **Step 4: 통과를 본다.** tsc, eslint.
- [ ] **Step 5: 커밋** `feat(account): 첫 로그인 합치기`

### Task 4: 가입·로그인·로그아웃 핸들러

**Files:**
- Create: `src/lib/account/handlers.ts`(이 작업은 인증 부분만)
- Create: `src/app/api/auth/signup/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`(모두 POST)
- Modify: `src/lib/rateLimit.ts`(LIMITS에 `auth`, `account`)
- Test: `$T/acct-auth.mjs`

**Interfaces:**
- Consumes: Task 1, Task 2
- Produces:
  - `type Deps = { config: AccountConfig | null; redis: Redis | null; now: () => number }`(ms)와 `defaultDeps(): Deps`
  - `signup(request: Request, deps: Deps): Promise<Response>`
  - `login(request: Request, deps: Deps): Promise<Response>`
  - `logout(request: Request, deps: Deps): Promise<Response>`
  - `sameOrigin(request: Request): boolean`
  - `currentSession(request: Request, deps: Deps): Promise<Session | null>`
  - 응답 형식
    - 성공: 200 `{ ok: true }` + 세션 쿠키
    - 실패: `{ error: 문구 }`. 400 규칙 위반, 401 맞지 않음, 403 Origin, 409 중복, 429 잠금, 503 설정 없음·Redis 오류
  - 가입 성공 때 Redis에 쓰는 것
    - `HSETNX acct:{id} auth {PasswordHash JSON}`
    - `HSET meta {"createdAt":ms,"updatedAt":ms}`
    - `EXPIRE` 1년

- [ ] **Step 1: 실패하는 시험을 쓴다**(`new Request("http://localhost:3000/api/auth/…", {method:"POST", headers:{Origin:"http://localhost:3000"}, body})`)
  - `signup-ok`: 200. 세션 쿠키를 `verifySession`하면 sub `"jaewon99"`. memRedis에 auth와 meta가 있고, auth JSON에 원문 비밀번호가 없다
  - `signup-normalizes-id`: `"Jaewon99"`로 가입하면 키는 `acct:jaewon99`
  - `signup-duplicate-409`: 같은 아이디 두 번째 → 409 "이미 쓰는 아이디예요."
  - `signup-rules-400`: 아이디 3자 → 아이디 문구, 비밀번호 7자 → 비밀번호 문구
  - `signup-unconfigured`: config null → 503 "로그인 준비 중이에요."
  - `signup-cross-origin-403`
  - `login-ok`: 가입한 아이디로 200 + 세션 쿠키. `fail:` 키가 없다
  - `login-unknown-id-same-message`: 없는 아이디와 틀린 비밀번호 모두 401 "아이디나 비밀번호가 맞지 않아요."
  - `login-lockout`: 틀린 비밀번호 5번 → 다음은 맞는 비밀번호여도 429 "로그인 시도가 많아요. 10분 뒤 다시 해 주세요." 10분 뒤(now 이동)에는 200
  - `login-redis-down-503`
  - `logout-clears`: 200, `kireumalimi_session=; Max-Age=0`
  - `not-json-400`: 본문이 JSON이 아니면 400
- [ ] **Step 2: 실행해 실패를 본다.**
- [ ] **Step 3: 핸들러, 라우트, rateLimit 한도를 만든다.**
  - 라우트는 `limitByClient(request, "auth")`를 먼저 하고 `defaultDeps()`를 넘긴다.
  - 로그에는 아이디나 비밀번호를 남기지 않는다. Redis 오류만 `console.warn`한다.
- [ ] **Step 4: 통과를 본다.** Task 1~3 시험도 다시 돌린다. tsc, eslint.
- [ ] **Step 5: 커밋** `feat(account): 가입·로그인·로그아웃`

### Task 5: 계정 API

**Files:**
- Modify: `src/lib/account/handlers.ts`
- Create: `src/app/api/account/route.ts`(GET, PUT, DELETE)
- Test: `$T/acct-api.mjs`

**Interfaces:**
- Consumes: Task 1~4
- Produces:
  - `getAccount(request, deps)`
    - 설정 없음: 200 `{enabled:false, account:null}`
    - 게스트: 200 `{enabled:true, account:null}`
    - 로그인: 200 `{enabled:true, account:{id, tag}, data}`
    - 키 없음: 401 `{enabled:true, account:null, deleted:true}` + 세션 쿠키 지움
    - Redis 오류: 503
  - `putAccount(request, deps)`: 본문 `{tag, data}`
    - 200 `{ok:true}`
    - 400: JSON 아님, data가 객체 아님, 모르는 칸(`auth`, `meta` 포함)
    - 401 세션 없음, 403 Origin, 409 tag 다름, 413 칸 크기 초과, 503 Redis 오류
  - `deleteAccount(request, deps)`: 200 `{ok:true}` + 세션 쿠키 지움(`acct:`와 `fail:` 키를 모두 지운다). 401, 403, 503
  - GET·PUT은 `EXPIRE REDIS_TTL`을 다시 걸고, PUT은 `meta.updatedAt`을 갱신한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**(세션 쿠키는 Task 4의 signup으로 만든다)
  - `get-unconfigured`, `get-guest`
  - `get-fresh-account`: data `{}`, tag는 16자 hex, id `"jaewon99"`, 응답에 `auth`나 `hash` 글자가 없다
  - `put-then-get`: profile·ledger를 올리고 받으면 같은 값(검사를 거친 값)
  - `put-wrong-tag-409`: Redis는 그대로
  - `put-unknown-field-400`: `{data:{auth:"x"}}`와 `{data:{token:"x"}}`
  - `put-not-json-400`
  - `put-too-big-413`: 아무 칸도 저장하지 않는다
  - `put-cross-origin-403`
  - `get-redis-down-503`: 세션 쿠키를 지우지 않는다
  - `get-deleted-401`: 키를 지운 뒤 401 `deleted:true`, 세션 쿠키 Max-Age=0
  - `delete-removes`: 200, 두 키 없음. 같은 아이디로 다시 가입할 수 있다
  - `rejoin-new-tag`: 탈퇴 뒤 다시 가입하면 tag가 다르다
- [ ] **Step 2: 실행해 실패를 본다.**
- [ ] **Step 3: 핸들러와 라우트를 만든다.** `limitByClient(request, "account")`.
- [ ] **Step 4: 통과를 본다.** Task 1~4 시험도 다시 돌린다. tsc, eslint.
- [ ] **Step 5: 커밋** `feat(account): 계정 API`

### Task 6: 브라우저 동기화

**Files:**
- Create: `src/lib/accountSync.ts`, `src/components/useAccount.ts`
- Modify: `src/lib/profile.ts`(주석만: 맨 위 설명, `signedIn` 위)
- Test: `$T/acct-sync.mjs`
  - 브라우저 둘을 흉내 낸다. 각자 localStorage·window·쿠키 통이 따로이다.
  - fetch는 Task 4·5 핸들러를 같은 memRedis로 부른다.
  - 모듈 상태가 섞이지 않게 브라우저마다 `?b=1`처럼 다른 쿼리로 다시 import한다.

**Interfaces:**
- Consumes: `STORE_KEYS`, `SYNC_FIELDS`, `AccountData`(Task 2), `mergeAccount`(Task 3), 각 저장소의 store·parse(profileStore/parseProfile, fillStore/parseFills, ledgerStore/parseLedger, alertStore/parseAlerts, watchStore/parseWatch)
- Produces:
  - `type AccountState = { status: "unknown" | "unavailable" | "guest" | "account"; id: string; notice: string | null }`
  - `accountStore`: `subscribe`, `getSnapshot`, `getServerSnapshot`(status `unknown`)
  - `startAccountSync(opts?: { fetch?: typeof fetch; debounceMs?: number }): void`
    - 한 번만 시작한다.
    - URL의 `account` 쿼리(`loggedout`, `deleted`)를 읽어 안내를 정하고 `history.replaceState`로 지운다.
    - 열 때 syncNow를 하고, `visibilitychange`가 보이게 바뀌면(1분에 한 번까지) 다시 한다.
    - 다섯 키의 `:change`를 듣는다. 동기화가 스스로 쓰는 동안에는 dirty로 치지 않는다.
  - `syncNow(): Promise<void>`: 설계 문서 '동기화'와 '처음 로그인할 때 합치기'
  - `signIn(mode: "login" | "signup", id: string, password: string): Promise<{ ok: true } | { ok: false; error: string }>`: 성공하면 syncNow까지 끝낸 뒤 돌려준다
  - `flushAccount(): Promise<boolean>`
  - `logoutAccount(opts: { force: boolean; navigate?: (url: string) => void }): Promise<{ ok: true } | { ok: false; reason: "unsynced" | "failed" }>`
    - 기본 navigate는 `location.assign("/?account=loggedout")`
  - `withdrawAccount(opts?: { navigate?: (url: string) => void }): Promise<{ ok: boolean }>`
    - 성공하면 `/?account=deleted`로 간다
  - `dismissNotice(): void`
  - `useAccount(): AccountState`: `useSyncExternalStore`로 읽고, 첫 마운트에 `startAccountSync()`를 부른다
- 안내 문구(설계 문서 그대로)
  - 합친 뒤: addedFills>0이면 "이 브라우저에 있던 주유 기록 {n}건을 계정에 합쳤어요.", 아니면 "로그인했어요."
  - 세션만 끝남: "로그인 기간이 끝났어요. 다시 로그인하면 계정과 맞춰요."
  - `loggedout`: "로그아웃했어요. 이 브라우저에서 내 정보와 기록을 지웠어요(계정에는 남아 있어요)."
  - `deleted`: "탈퇴했어요. 계정의 내 정보와 기록을 모두 지웠어요."

- [ ] **Step 1: 실패하는 시험을 쓴다**
  - `guest-noop`: PUT이 0번이고 저장소가 그대로
  - `first-login-merges`: A에 게스트 장부 3건 → signIn("signup") → 계정에 3건, sync tag가 있고 dirty `[]`, 안내 "…3건을 계정에 합쳤어요."
  - `second-device-pulls`: 빈 B에서 signIn("login") → B 장부 3건, 안내 "로그인했어요."
  - `write-pushes`: B에서 `addLedgerEntry` → flushAccount → A가 syncNow하면 4건
  - `dirty-not-overwritten`: A 오프라인에서 고치면 dirty `["ledger"]`. 온라인으로 syncNow하면 계정에 A의 값
  - `sync-server-down-keeps-local`: memRedis.fail → syncNow → 지운 것 없음
  - `other-account-tag-clears-first`: A의 tag가 계정 X인데 Y로 로그인 → X 장부가 Y로 가지 않는다
  - `expired-session-keeps-copy`: 쿠키를 버리고 syncNow → 사본 그대로, '로그인 기간이 끝났어요…'. 그 뒤 고친 칸이 dirty이고 같은 계정으로 다시 로그인하면 올라간다
  - `logout-flushes-then-clears`: dirty가 있으면 먼저 PUT, 다섯 키와 sync 키가 지워지고 navigate가 `/?account=loggedout`
  - `logout-unsynced-asks`: Redis fail + dirty → `{ok:false, reason:"unsynced"}`이고 지운 것 없음. force:true면 지운다
  - `withdraw-clears-other-device`: B가 withdraw → B 키 없음, 계정 없음. A가 syncNow하면 401로 A 사본도 지워진다
  - `storage-unavailable-no-throw`: setItem이 던져도 syncNow는 예외 없이 끝난다
- [ ] **Step 2: 실행해 실패를 본다.**
- [ ] **Step 3: 두 파일을 만들고 profile.ts 주석을 고친다.** 브라우저 값은 각 저장소의 `write`로 써서 화면이 다시 그려지게 한다.
- [ ] **Step 4: 통과를 본다.** Task 1~5 시험도 다시 돌린다. tsc, eslint.
- [ ] **Step 5: 커밋** `feat(account): 브라우저와 계정 동기화`

### Task 7: 화면 — 로그인·가입 칸, 머리글, 안내 한 줄

> 시작 전: feat/guest-location이 main에 병합됐는지 본다. 병합됐으면 `git rebase origin/main`을 한다. 아니면 그 세션의 작업 사본에서 LoginForm·AppShell이 어떻게 바뀌는지 보고 겹치는 줄을 피한다. rebase는 병합 뒤에 한다.

**Files:**
- Create: `src/components/AccountPanel.tsx`
  - `part="top"`: 게스트는 로그인·가입 칸, 로그인한 사람은 'jaewon99 계정으로 로그인했어요…'
  - `part="actions"`: 로그아웃, 회원 탈퇴 확인
- Create: `src/components/AccountNotice.tsx`
- Modify: `src/components/LoginForm.tsx`
  - 제목·설명
  - 머리말 아래에 `<AccountPanel part="top" />`, 버튼 줄에 `<AccountPanel part="actions" />`
  - 맨 아래 안내 문구
  - 게스트의 '로그아웃' → '이 브라우저의 내 정보 지우기'
- Modify: `src/components/AppShell.tsx`: 머리글 로그인 버튼과 아바타는 `useAccount()`로 정하고, `<main>` 맨 위에 `<AccountNotice />`
- Test: 브라우저 확인(preview, 개발 파일 저장)

**Interfaces:**
- Consumes: `useAccount`, `signIn`, `logoutAccount`, `withdrawAccount`, `dismissNotice`(Task 6), `savedLedgerAll`
- Produces: `AccountPanel({ part }: { part: "top" | "actions" })`, `AccountNotice()`

- 정해진 모양
  - 입력란의 autocomplete: `username`, 로그인은 `current-password`, 가입은 `new-password`(확인 칸 포함). 아이디 칸은 `autoCapitalize="none"`, `spellCheck={false}`.
  - status가 `unknown`이면 칸 자리를 같은 높이로 비워 두고, `unavailable`이면 "로그인 준비 중이에요"만 보인다.
  - 보내는 중에는 버튼을 막는다. 오류는 `role="alert"`로 칸 아래에 보인다.
  - 탈퇴 확인은 그 자리에 펼친다. 문구는 설계 문서 그대로이고 N = `savedLedgerAll().length`.
  - 로그아웃이 `unsynced`면 설계 문서의 문구와 [다시 시도]·[그래도 로그아웃].
  - 머리글: `account`면 아바타(이름 첫 글자, 없으면 아이디 첫 글자). 아니면 '로그인' 버튼. `unknown`이면 지금의 빈 아바타 자리 표시.

- [ ] **Step 1: 화면 코드를 쓴다.**
- [ ] **Step 2: tsc, eslint, `npm run build`.** 빌드 출력에서 `/api/account`·`/api/auth/*`가 ƒ(동적)인지 본다.
- [ ] **Step 3: 브라우저 확인**(`.env.local`에 Upstash·AUTH_SECRET 없이 → `.data/` 파일 저장)
  - `.claude/launch.json`에는 내 이름의 항목만 더하고 뺀다.
  - 확인할 장면:
    1. 게스트 기능이 그대로다.
    2. 게스트로 장부를 남기고 가입하면 '…건을 계정에 합쳤어요'가 보인다.
    3. localStorage를 비운 새 탭에서 로그인하면 같은 기록이 보인다.
    4. 로그아웃하면 기록이 지워지고, 다시 로그인하면 돌아온다.
    5. 틀린 비밀번호 문구와 중복 아이디 문구가 맞다.
    6. 탈퇴하면 `.data/accounts.json`에 키가 없다.
    7. 휴대폰 폭(375px)에서 칸과 확인 창이 넘치지 않는다.
- [ ] **Step 4: 스크린샷을 남긴다.** 로그인 칸, 가입 칸, 내 정보, 탈퇴 확인, 휴대폰 폭.
- [ ] **Step 5: 커밋** `feat(account): 로그인 화면과 머리글을 계정으로`

### Task 8: 처리방침, 환경변수 예시, 문서, PR

**Files:**
- Modify: `src/app/privacy/page.tsx`(guest-location이 만든 페이지에 설계 문서 '개인정보 처리방침에 더할 것' 표를 모두 반영하고, "서버는 저장하지 않음"을 고친다)
- Modify: `.env.example`(이름과 한 줄 설명), `README.md`(간편 로그인 문단 → 아이디 계정, 팀원 설정), `PRODUCT.md`(한 줄), `DESIGN.md`(로그인 화면·머리글 한 줄)

- [ ] **Step 1: 처리방침과 문서를 고친다.** 보관 지역은 '도쿄(DB를 만들 때 고른 지역으로 맞춤)'라고 쓴다.
- [ ] **Step 2: 전체 확인**: `$T/acct-*.mjs` 여섯 개 통과, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] **Step 3: 커밋** `docs(account): 처리방침·환경변수·문서`
- [ ] **Step 4: 브랜치 전체 검토**: 새 검토자에게 `git diff origin/main...HEAD`를 맡기고, 중요한 지적은 고친다.
- [ ] **Step 5: push하고 PR을 연다.**
  - 본문: 바뀌는 것, 팀원 할 일, 시험 결과, 확인 못 한 것(운영).
  - 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
  - 그 뒤 `get_status`. 병합은 이용자가 허락할 때만 한다.
