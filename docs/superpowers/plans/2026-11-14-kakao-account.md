# 카카오 로그인 계정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오로 로그인·로그아웃·탈퇴하고, 로그인한 사람의 내 정보·주유 기록·알림 설정이 기기를 바꿔도 따라오게 한다.

**Architecture:**
- 서버: 카카오 OAuth를 라우트 핸들러 몇 개로 직접 처리하고, 로그인 상태는 HMAC으로 서명한 세션 쿠키로 둔다. 계정 데이터는 Upstash Redis 해시 `acct:{회원번호}` 하나에 칸별 JSON으로 둔다.
- 브라우저: 화면은 지금의 localStorage 저장소를 그대로 쓴다. `accountSync`가 다섯 저장소의 `:change` 이벤트를 듣고 계정에 올리고, 열 때 계정에서 받아 온다.
- 핸들러는 설정·Redis·fetch·시계를 인자로 받는 함수로 짠다. route.ts는 기본값을 넣어 부르기만 한다. 그래서 node 스크립트로 서버 없이 시험할 수 있다.

**Tech Stack:** Next.js 16.4 App Router 라우트 핸들러(Web Request/Response), Web Crypto(HMAC-SHA256), Upstash Redis REST(fetch), React 19 `useSyncExternalStore`, Tailwind 4, Node 26 type stripping 시험.

**Spec:** `docs/superpowers/specs/2026-11-14-kakao-account-design.md` (실행자는 계획과 함께 읽는다)

## Global Constraints
- 새 npm 의존성은 넣지 않는다.
- 키와 시크릿은 `.env.local`과 Vercel 환경변수에만 둔다. 코드, 커밋, 로그, 응답 본문에 값을 쓰지 않는다. `.env.example`에는 이름만 적는다.
- 환경변수 이름:
  - `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_ADMIN_KEY`, `AUTH_SECRET`
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. 없으면 `KV_REST_API_URL`, `KV_REST_API_TOKEN`을 읽는다.
  - 개발 전용: `KAKAO_AUTH_BASE`, `KAKAO_API_BASE`. `NODE_ENV !== "production"`일 때만 읽는다.
- 동기화하는 브라우저 키: `kireumalimi.profile`, `.fills`, `.ledger`, `.alerts`, `.watch`. 계정 칸 이름은 `profile`, `fills`, `ledger`, `alerts`, `watch`. 동기화 상태 키는 `kireumalimi.sync`.
- 쿠키:
  - 세션 `kireumalimi_session`: httpOnly, SameSite=Lax, https면 Secure, Path=/, 30일(2,592,000초).
  - 위조 방지 `kireumalimi_oauth`: httpOnly, SameSite=Lax, Path=/api/auth/kakao, 600초.
- Redis 키 만료 1년(31,536,000초). 읽거나 쓸 때마다 다시 건다. 칸 하나는 64KB(65,536바이트)까지.
- 호출 제한: `account` 10분에 120번, `auth` 10분에 30번(`src/lib/rateLimit.ts`의 LIMITS).
- 화면 문구는 해요체이고 DESIGN.md 말투를 따른다. 안내 문구는 설계 문서의 '안내 한 줄'을 그대로 쓴다.
- 기존 검사 함수를 다시 쓴다. `cleanProfile`, `parseFills`, `cleanLedger(…, MAX_SAVED_LEDGER)`, `parseAlerts`, `parseWatch`, `cleanText`.
- `signedIn(profile)`의 이름과 동작은 바꾸지 않는다. 주석만 '내 정보를 저장함'으로 고친다.
- 고치지 않는 파일: ChatPanel.tsx, ConditionBar.tsx, chatbot.ts. 다른 작업(feat/guest-location)과 겹치기 때문이다.
- 커밋 작성자: `git -c user.name="배재원" -c user.email="273242562+jaewonbbae@users.noreply.github.com"`. 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 시험 위치와 실행 방법
  - 시험은 저장소 밖 `$T`(= `/private/tmp/claude-501/-Users-jaewon-Desktop--26-UNIST-------------AI----------/4051cbe8-5982-4651-968e-9452ae1f4920/scratchpad/apptest`)에 둔다.
  - 실행: `APP_ROOT=$R node --import $T/register.mjs $T/<name>.mjs`. `$R`은 작업 사본 `…/scratchpad/acct`이다.
  - `register.mjs`·`hooks.mjs`는 기존 apptest에서 복사한다(`@/` 경로와 .ts 확장자를 풀어 줌).
- 매 작업 끝에 `npx tsc --noEmit`과 `npx eslint <바꾼 파일>`이 통과해야 한다.

## Review Focus
1. **두 탭에서 로그아웃 뒤 다른 계정으로 로그인**: 앞 탭에 대기 중이던 올리기는 409로 거절되고 새 계정 데이터는 그대로다 → Task 5 `put-wrong-tag-409`.
2. **로그인 취소, 10분 지난 state, 다른 브라우저에서 연 콜백**: 세션 없이 `/login?account=failed`로 간다 → Task 4 `callback-*` 시험들.
3. **Redis가 죽거나 5xx**: GET은 503을 주고, 브라우저는 아무것도 지우지 않고 dirty를 남긴다 → Task 5 `get-redis-down-503`, Task 6 `sync-server-down-keeps-local`.
4. **망가진 PUT 본문**(JSON 아님, 64KB 넘음, 모르는 칸, 잘못된 값): 400 또는 413이고 아무것도 저장하지 않는다. 잘못된 값은 검사 함수가 기본값으로 바꾼다 → Task 5 `put-*` 시험들.
5. **키 없이 배포된 운영**: `/api/account`는 `{enabled:false}`, `/api/auth/kakao`는 `/login?account=unavailable`로 보내고, 화면은 '준비 중'을 보인다. 게스트 기능은 그대로다 → Task 4 `start-unconfigured`, Task 5 `get-unconfigured`, Task 7 브라우저 확인.

---

### Task 1: 세션 서명, 쿠키, 설정

**Files:**
- Create: `src/lib/account/session.ts`, `src/lib/account/cookies.ts`, `src/lib/account/config.ts`
- Test: `$T/acct-session.mjs` (+ `$T/register.mjs`, `$T/hooks.mjs` 복사)

**Interfaces:**
- Produces:
  - `type Session = { sub: string; nick: string; iat: number; exp: number }` (초 단위)
  - `signSession(session: Session, secret: string): Promise<string>`: `base64url(JSON).base64url(HMAC)` 형식
  - `verifySession(token: string | undefined, secret: string, nowSec: number): Promise<Session | null>`
  - `accountTag(sub: string, createdAt: number, secret: string): Promise<string>`: `HMAC(secret, sub + ":" + createdAt)` hex 앞 16자
  - `randomToken(): string`: 32바이트 base64url
  - `safeEqual(a: string, b: string): boolean`
  - `SESSION_COOKIE = "kireumalimi_session"`, `STATE_COOKIE = "kireumalimi_oauth"`, `SESSION_MAX_AGE = 2_592_000`, `STATE_MAX_AGE = 600`
  - `readCookie(request: Request, name: string): string | undefined`
  - `cookieHeader(name: string, value: string, opts: { maxAge: number; path?: string; secure: boolean }): string`: HttpOnly, SameSite=Lax 고정
  - `clearCookieHeader(name: string, opts: { path?: string; secure: boolean }): string`: Max-Age=0
  - `type AccountConfig = { restKey: string; clientSecret: string; adminKey: string; secret: string; authBase: string; apiBase: string; redisUrl: string; redisToken: string }`
  - `accountConfig(env?: Record<string, string | undefined>): AccountConfig | null`: 필요한 값이 하나라도 없으면 null. `authBase` 기본값 `https://kauth.kakao.com`, `apiBase` 기본값 `https://kapi.kakao.com`. 개발 전용 덮어쓰기는 `env.NODE_ENV !== "production"`일 때만. `secret`은 32자 미만이면 null.

- [ ] **Step 1: 실패하는 시험을 쓴다** (`acct-session.mjs`)
  - `sign-verify-roundtrip`: 서명한 세션을 같은 시크릿·만료 전 시각으로 검증하면 같은 객체(닉네임에 한글 "재원")
  - `verify-rejects-tampered`: 페이로드 한 글자를 바꾸면 null
  - `verify-rejects-other-secret`: 다른 시크릿이면 null
  - `verify-rejects-expired`: `nowSec >= exp`이면 null
  - `verify-rejects-garbage`: `undefined`, `""`, `"a.b.c"`, `"abc"`이면 null
  - `tag-stable-and-distinct`: 같은 입력이면 같은 16자 hex. createdAt이나 sub가 다르면 다른 값
  - `cookie-header`: `cookieHeader("x","v",{maxAge:600,path:"/api/auth/kakao",secure:true})`에 `HttpOnly`, `SameSite=Lax`, `Secure`, `Max-Age=600`, `Path=/api/auth/kakao`가 들어 있다. secure:false면 `Secure`가 없다
  - `read-cookie`: `Cookie: a=1; kireumalimi_session=tok%2E; b=2` 머리글에서 디코드한 `"tok."`를 읽는다
  - `config-null-when-missing`: 여섯 값 중 하나라도 빠지면 null. `KV_REST_API_*`만 있어도 설정된다
  - `config-dev-override`: `NODE_ENV:"production"`이면 `KAKAO_AUTH_BASE`를 무시하고, `"development"`면 쓴다
- [ ] **Step 2: 실행해 실패를 본다.** `APP_ROOT=$R node --import $T/register.mjs $T/acct-session.mjs` → 모듈이 없어 실패
- [ ] **Step 3: 세 파일을 만든다.**
  - HMAC은 `crypto.subtle.importKey("raw", …, {name:"HMAC", hash:"SHA-256"})`와 `sign`/`verify`로 한다.
  - base64url은 `Buffer` 없이 `btoa`/`atob`와 `TextEncoder`로 한다. 엣지에서도 돌게 하려는 것이다.
- [ ] **Step 4: 다시 실행해 모두 통과**를 본다(`acct-session: 10 passed`).
- [ ] **Step 5: 커밋** `feat(account): 세션 서명·쿠키·설정`

### Task 2: Upstash REST 클라이언트와 계정 칸 검사

**Files:**
- Create: `src/lib/account/redis.ts`, `src/lib/account/fields.ts`
- Test: `$T/acct-fields.mjs`, `$T/fakeRedis.mjs`(시험용 메모리 Redis, 이후 작업이 같이 쓴다)

**Interfaces:**
- Produces:
  - `type Redis = { hgetall(key: string): Promise<Record<string, string> | null>; hset(key: string, fields: Record<string, string>): Promise<void>; hsetnx(key: string, field: string, value: string): Promise<boolean>; del(key: string): Promise<void>; expire(key: string, seconds: number): Promise<void> }`
  - `restRedis(url: string, token: string, fetchImpl?: typeof fetch): Redis`
    - 요청: `POST {url}`, `Authorization: Bearer {token}`, 본문은 명령 배열(예: `["HGETALL","acct:1"]`).
    - 응답 `{result}`를 쓴다. `{error}`나 2xx가 아니면 `RedisError`를 던진다.
    - HGETALL의 결과 배열 `[k1,v1,…]`은 객체로 바꾼다. 빈 배열이면 null.
  - `class RedisError extends Error`
  - `SYNC_FIELDS = ["profile","fills","ledger","alerts","watch"] as const`, `type SyncField`
  - `STORE_KEYS: Record<SyncField, string>`: `kireumalimi.<칸>`
  - `type AccountData = Partial<{ profile: Profile; fills: FillRecord[]; ledger: LedgerEntry[]; alerts: SavedAlert[]; watch: Watch }>`
  - `cleanField(field: SyncField, value: unknown): unknown`: 칸별 검사 함수로 다시 검사한다. fills는 `parseFills(JSON.stringify(v))` 결과를 날짜순으로 최근 `MAX_RECORDS`개.
  - `MAX_FIELD_BYTES = 65_536`, `REDIS_TTL = 31_536_000`
  - `accountKey(sub: string) => "acct:" + sub`
  - `parseStored(hash: Record<string, string>): AccountData`: 칸마다 JSON.parse → cleanField. 깨진 칸은 빼고, meta도 뺀다.
- 시험용 `fakeRedis()`는 `Redis`를 만족하고 `dump()`, `fail(on: boolean)`(켜면 모든 명령이 RedisError)을 준다.

- [ ] **Step 1: 실패하는 시험을 쓴다**
  - `rest-hgetall-to-object`: 가짜 fetch가 `{result:["profile","{}","meta","{\"createdAt\":1}"]}`를 주면 `{profile:"{}", meta:"…"}`. 빈 배열이면 null. 보낸 본문이 `["HGETALL","acct:1"]`이고 Bearer 머리글이 붙는다.
  - `rest-hset-flattens`: `hset("k",{a:"1",b:"2"})`가 `["HSET","k","a","1","b","2"]`를 보낸다.
  - `rest-error-throws`: 500이나 `{error:"x"}`면 RedisError.
  - `clean-profile-defaults`: `cleanField("profile",{name:"<b>재원</b>",fuel:"우유"})` → 이름 `"b재원b"`(cleanText 결과대로), 유종 `"휘발유"`.
  - `clean-fills-cap`: fills 7개 → 날짜순 최근 5개.
  - `clean-ledger-cap`: 장부 120개 → 100개.
  - `parse-stored-skips-broken`: `{profile:"{", ledger:"[]", meta:"…"}` → `{ledger:[]}`.
- [ ] **Step 2: 실행해 실패를 본다.**
- [ ] **Step 3: 두 파일과 `fakeRedis.mjs`를 만든다.**
- [ ] **Step 4: 통과를 본다.**
- [ ] **Step 5: 커밋** `feat(account): Upstash REST와 계정 칸 검사`

### Task 3: 처음 로그인할 때 합치기

**Files:**
- Create: `src/lib/account/merge.ts`
- Test: `$T/acct-merge.mjs`

**Interfaces:**
- Consumes: `AccountData`, `SYNC_FIELDS` (Task 2), `GUEST`, `cleanText`, `LIMITS` (profile.ts)
- Produces:
  - `isFilledProfile(profile: Profile): boolean`: 이름을 빼고 `GUEST`와 다른 칸이 있으면 true(JSON 비교)
  - `anyWatch(watch: Watch): boolean`
  - `mergeAccount(local: AccountData, remote: AccountData, nickname: string): { merged: Required<AccountData>; addedFills: number }`
    - 규칙은 설계 문서 '처음 로그인할 때 합치기' 2를 그대로 따른다.
      - 이름은 계정 → 브라우저 → 닉네임 순으로 고른다(`cleanText(…, LIMITS.name)`).
      - alerts가 같은 조건이면 계정 쪽을 남긴다. 합친 뒤 id(시각 글자) 순으로 정렬해 최근 5개.
    - `addedFills`: 브라우저의 (ledger ∪ fills) 날짜 가운데 계정의 (ledger ∪ fills)에 없던 날짜의 수.

- [ ] **Step 1: 실패하는 시험을 쓴다**
  - `empty-remote-takes-local`: 계정이 비었으면 브라우저 것 그대로. addedFills = 브라우저 날짜 수.
  - `filled-remote-profile-wins`: 계정 profile에 차종이 있으면 계정 것. 브라우저 이름은 쓰지 않는다.
  - `default-remote-profile-loses`(검토자가 짚은 경우): 계정 profile이 `{...GUEST, name:"카카오닉"}`이고 브라우저에 경유·위치가 있으면 브라우저 것. 이름은 `"카카오닉"`.
  - `nickname-fills-empty-name`: 양쪽 이름이 비면 닉네임(13자 넘으면 12자로).
  - `ledger-same-date-remote-wins`: 같은 날 장부는 계정 것. 결과는 날짜순.
  - `fills-cap-5`: 합쳐 7개면 최근 5개.
  - `alerts-dedupe-cap-5`: 같은 (fuel, area, belowWon)은 하나. 최대 5개.
  - `watch-all-false-remote-loses`: 계정 watch가 다 false면 브라우저 것.
  - `idempotent`: `mergeAccount(merged, merged, nick).merged`가 `merged`와 같고 addedFills는 0.
- [ ] **Step 2: 실행해 실패를 본다.**
- [ ] **Step 3: `merge.ts`를 만든다.**
- [ ] **Step 4: 통과를 본다.**
- [ ] **Step 5: 커밋** `feat(account): 첫 로그인 합치기`

### Task 4: 카카오 로그인·로그아웃 핸들러

**Files:**
- Create: `src/lib/account/kakao.ts`, `src/lib/account/handlers.ts`(이 작업은 로그인 부분만)
- Create: `src/app/api/auth/kakao/route.ts`(GET), `src/app/api/auth/kakao/callback/route.ts`(GET), `src/app/api/auth/logout/route.ts`(POST)
- Modify: `src/lib/rateLimit.ts`(LIMITS에 `account`, `auth` 더함)
- Test: `$T/acct-auth.mjs`, `$T/fakeKakao.mjs`(가짜 fetch: 토큰·user/me·unlink를 흉내 내고 받은 요청을 기록)

**Interfaces:**
- Consumes: Task 1 전부, `Redis`, `accountKey`, `REDIS_TTL` (Task 2)
- Produces:
  - `type Deps = { config: AccountConfig | null; redis: Redis | null; fetch: typeof fetch; now: () => number }`(ms)와 `defaultDeps(): Deps`
  - `kakao.ts`
    - `authorizeUrl(cfg, redirectUri: string, state: string): string`
    - `exchangeCode(cfg, deps, redirectUri, code): Promise<string>`(access token)
    - `fetchKakaoUser(cfg, deps, accessToken): Promise<{ id: string; nickname: string }>`: 동의하지 않았으면 nickname은 `""`
    - `unlinkKakaoUser(cfg, deps, id): Promise<boolean>`
    - `kakaoLogoutUrl(cfg, logoutRedirectUri): string`
  - `handlers.ts`
    - `startLogin(request: Request, deps: Deps): Promise<Response>`
    - `finishLogin(request: Request, deps: Deps): Promise<Response>`
    - `logout(request: Request, deps: Deps): Promise<Response>`: 본문 `{ kakaoLogoutUrl: string | null }`
    - `sameOrigin(request: Request): boolean`: `Origin`이 `new URL(request.url).origin`과 같다
    - `currentSession(request, deps): Promise<Session | null>`
  - 콜백의 리다이렉트
    - 성공: `{origin}/login?account=welcome`
    - 실패: `/login?account=failed`
    - 설정 없음: `/login?account=unavailable`
  - 로그아웃 리다이렉트 URI: `{origin}/?account=loggedout`. origin이 https일 때만 카카오 로그아웃 주소를 준다.
  - 콜백은 성공 시 `HSETNX acct:{id} meta {"createdAt":<ms>,"updatedAt":<ms>}`와 `EXPIRE`를 한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**(`new Request("http://localhost:3000/…")`로 부른다)
  - `start-redirects-with-state`: 302. Location이 `{authBase}/oauth/authorize?client_id=…&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fkakao%2Fcallback&response_type=code&state=S`. Set-Cookie의 `kireumalimi_oauth` 값이 S. 쿠키와 Location에 시크릿·어드민 키가 없다.
  - `start-unconfigured`: config null → 302 `/login?account=unavailable`.
  - `callback-success`: state 쿠키와 쿼리가 같고 가짜 카카오가 id 4242, 닉네임 "재원"을 주면 302 `/login?account=welcome`.
    - 세션 쿠키를 `verifySession`하면 sub `"4242"`, nick `"재원"`이고 만료는 30일 뒤.
    - state 쿠키는 지워진다(Max-Age=0).
    - fakeRedis에 `acct:4242`의 meta가 생긴다.
    - 토큰 요청 본문에 `client_secret`이 들어 있다.
  - `callback-state-mismatch`: 쿼리 state가 다르면 `/login?account=failed`, 세션 쿠키 없음. 가짜 카카오가 받은 요청 수는 0.
  - `callback-no-state-cookie`: 쿠키가 없으면 failed.
  - `callback-user-cancelled`: `?error=access_denied&state=S` → failed.
  - `callback-token-error`: 토큰 응답이 400이면 failed. 세션 없음.
  - `callback-keeps-createdAt`: 두 번 로그인해도 meta.createdAt이 처음 값 그대로(HSETNX).
  - `logout-clears-and-returns-kakao-url`: `https://kireumalimi-web.vercel.app`에서 Origin이 같으면 200. 세션 쿠키 Max-Age=0. 본문의 `kakaoLogoutUrl`이 `{authBase}/oauth/logout?client_id=…&logout_redirect_uri=https%3A%2F%2Fkireumalimi-web.vercel.app%2F%3Faccount%3Dloggedout`.
  - `logout-localhost-no-kakao-url`: `http://localhost:3000`이면 `kakaoLogoutUrl`이 null이다. 카카오가 80·443 포트만 받기 때문이다.
  - `logout-cross-origin-403`: Origin이 다르면 403.
- [ ] **Step 2: 실행해 실패를 본다.**
- [ ] **Step 3: `kakao.ts`, `handlers.ts`(로그인 부분), 라우트 세 개, rateLimit 한도를 만든다.**
  - 라우트는 `limitByClient(request, "auth")`를 먼저 하고 핸들러에 `defaultDeps()`를 넘긴다.
  - 카카오 응답 본문과 토큰은 로그에 남기지 않는다. 실패 때는 상태 코드만 `console.warn`.
- [ ] **Step 4: 통과를 본다.** `npx tsc --noEmit`, eslint도 확인.
- [ ] **Step 5: 커밋** `feat(account): 카카오 로그인·로그아웃`

### Task 5: 계정 API와 연결 끊기 웹훅

**Files:**
- Modify: `src/lib/account/handlers.ts`(아래 함수 더함)
- Create: `src/app/api/account/route.ts`(GET, PUT, DELETE), `src/app/api/auth/kakao/unlink/route.ts`(GET, POST)
- Test: `$T/acct-api.mjs`

**Interfaces:**
- Consumes: Task 1~4
- Produces:
  - `getAccount(request, deps): Promise<Response>`
    - 설정 없음: 200 `{enabled:false, account:null}`
    - 게스트: 200 `{enabled:true, account:null}`
    - 로그인: 200 `{enabled:true, account:{nickname, tag}, data}`
    - 키 없음: 401 `{enabled:true, account:null, deleted:true}` + 세션 쿠키 지움
    - Redis 오류: 503 `{error}`
  - `putAccount(request, deps)`: 본문 `{tag, data}`
    - 200 `{ok:true}`
    - 400: JSON 아님, data가 객체가 아님, 모르는 칸
    - 401: 세션 없음. 403: Origin 다름. 409: tag 다름. 413: 칸 하나가 64KB 넘음. 503: Redis 오류
  - `deleteAccount(request, deps)`: 200 `{ok:true, kakaoUnlinked:boolean}` + 세션 쿠키 지움. 401, 403, 503
  - `unlinkWebhook(request, deps)`
    - 늘 200을 준다.
    - `Authorization`이 `KakaoAK {adminKey}`와 같을 때만(safeEqual) `user_id`의 키를 지운다.
    - `user_id`는 쿼리나 form 본문에서 읽는다.
  - 공통: 읽거나 쓰면 `EXPIRE REDIS_TTL`. 쓰면 `meta.updatedAt`을 갱신한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**(fakeRedis와 fakeKakao, Task 4의 콜백으로 만든 세션 쿠키를 쓴다)
  - `get-unconfigured`: `{enabled:false}`
  - `get-guest`: `{enabled:true, account:null}`
  - `get-fresh-account`: 갓 로그인한 계정이면 data `{}`, tag는 16자 hex, nickname `"재원"`
  - `put-then-get`: profile·ledger를 올린 뒤 GET하면 같은 값(검사를 거친 값)
  - `put-wrong-tag-409`: 다른 tag면 409. Redis는 그대로
  - `put-unknown-field-400`: `{data:{token:"x"}}` → 400
  - `put-not-json-400`
  - `put-too-big-413`: ledger 칸이 64KB를 넘으면 413. 아무 칸도 저장하지 않는다
  - `put-cross-origin-403`
  - `get-redis-down-503`: `fakeRedis.fail(true)` → 503. 세션 쿠키를 지우지 않는다
  - `get-deleted-401`: 키를 지운 뒤 GET → 401 `deleted:true`, 세션 쿠키 Max-Age=0
  - `delete-removes-and-unlinks`: 200 `kakaoUnlinked:true`. 키가 없다. 가짜 카카오 unlink 요청의 머리글이 `KakaoAK …`이고 본문에 `target_id_type=user_id&target_id=4242`
  - `delete-unlink-fails-still-ok`: unlink가 500이어도 200 `kakaoUnlinked:false`. 키는 지워진다
  - `webhook-deletes-with-admin-key`: 맞는 머리글과 `user_id=4242` → 200, 키 없음
  - `webhook-wrong-key-keeps`: 머리글이 다르면 200, 키는 그대로
  - `rejoin-new-tag`: 지우고 다시 로그인하면 tag가 처음과 다르다
- [ ] **Step 2: 실행해 실패를 본다.**
- [ ] **Step 3: 핸들러와 라우트를 만든다.** `/api/account`는 `limitByClient(request, "account")`, 웹훅은 제한하지 않는다.
- [ ] **Step 4: 통과를 본다.** Task 1~4 시험도 다시 돌린다. tsc, eslint.
- [ ] **Step 5: 커밋** `feat(account): 계정 API와 연결 끊기 웹훅`

### Task 6: 브라우저 동기화

**Files:**
- Create: `src/lib/accountSync.ts`, `src/components/useAccount.ts`
- Modify: `src/lib/profile.ts`(주석 두 줄만: 맨 위 설명, `signedIn` 위)
- Test: `$T/acct-sync.mjs`(브라우저 둘을 흉내 낸다. 각자 localStorage·window·쿠키 통이 따로이고, fetch는 Task 4·5 핸들러를 같은 fakeRedis로 부른다)

**Interfaces:**
- Consumes: `STORE_KEYS`, `SYNC_FIELDS`, `AccountData`(Task 2), `mergeAccount`(Task 3), 각 저장소 store·parse 함수(profileStore/parseProfile, fillStore/parseFills, ledgerStore/parseLedger, alertStore/parseAlerts, watchStore/parseWatch)
- Produces:
  - `type AccountState = { status: "unknown" | "unavailable" | "guest" | "account"; nickname: string; notice: string | null; pending: number }`. pending은 dirty 칸 수.
  - `accountStore`: `subscribe`, `getSnapshot`, `getServerSnapshot`(`unknown`). useSyncExternalStore용
  - `startAccountSync(opts?: { fetch?: typeof fetch; debounceMs?: number }): () => void`
    - 한 번만 시작한다.
    - URL의 `account` 쿼리(`welcome`/`failed`/`unavailable`/`loggedout`)를 읽어 안내를 정하고 `history.replaceState`로 지운다.
    - GET 동기화를 하고, `visibilitychange`가 보이게 바뀌면(1분에 한 번까지) 다시 한다.
    - 다섯 키의 `:change`를 듣는다. 동기화가 스스로 쓰는 동안에는 dirty로 치지 않는다.
  - `syncNow(): Promise<void>`: 설계 문서 '동기화'의 열 때 규칙과 '처음 로그인할 때 합치기'
  - `flushAccount(): Promise<boolean>`: dirty를 올린다. 성공하거나 올릴 것이 없으면 true
  - `logoutAccount(opts: { force: boolean; navigate?: (url: string) => void }): Promise<{ ok: true } | { ok: false; reason: "unsynced" | "failed" }>`
    - 성공하면 `navigate(kakaoLogoutUrl ?? "/?account=loggedout")`를 한다. 기본 navigate는 `location.assign`이고, 시험은 바꿔 넣는다.
  - `withdrawAccount(): Promise<{ ok: boolean; kakaoUnlinked: boolean }>`
  - `dismissNotice(): void`
  - `useAccount(): AccountState`(`src/components/useAccount.ts`): `useSyncExternalStore`로 읽고, 첫 마운트에 `startAccountSync()`를 부른다.
- 안내 문구
  - 합친 뒤: `addedFills > 0`이면 "이 브라우저에 있던 주유 기록 {n}건을 계정에 합쳤어요.", 0이면 "카카오 계정으로 로그인했어요."
  - 세션만 끝남: "로그인 기간이 끝났어요. 다시 로그인하면 계정과 맞춰요."
  - 그 밖은 설계 문서 그대로.

- [ ] **Step 1: 실패하는 시험을 쓴다**
  - `guest-noop`: 세션 없는 브라우저 A에서 syncNow → 저장소가 그대로이고 PUT 요청이 0번
  - `first-login-merges`: A에 게스트 장부 3건 → 로그인(쿠키 통에 세션) → syncNow
    - 계정에 3건이 있다.
    - `kireumalimi.sync`에 tag가 있고 dirty는 `[]`.
    - 안내는 "…3건을 계정에 합쳤어요."
  - `second-device-pulls`: 빈 브라우저 B가 같은 계정으로 로그인하고 syncNow → B 장부 3건, 안내는 "카카오 계정으로 로그인했어요."
  - `write-pushes`: B에서 `addLedgerEntry` → debounce 0으로 flush → A에서 syncNow하면 4건
  - `dirty-not-overwritten`: A 오프라인(fetch 실패)에서 장부를 고치면 dirty `["ledger"]`. 다시 온라인이 되어 syncNow하면 A의 값이 계정에 올라가고 지워지지 않는다
  - `sync-server-down-keeps-local`: Redis fail → syncNow → 아무것도 지우지 않고 status는 그대로
  - `other-account-tag-clears-first`: A의 tag가 계정 X 것인데 계정 Y로 로그인 → X의 장부는 Y로 올라가지 않는다
  - `expired-session-keeps-copy`: 세션 쿠키를 버리고 syncNow → 사본이 그대로이고 안내는 '로그인 기간이 끝났어요…'. 그 뒤 고친 칸은 dirty. 같은 계정으로 다시 로그인하면 올라간다
  - `logout-flushes-then-clears`: dirty가 있는 채로 logoutAccount({force:false}) → 먼저 PUT. 다섯 키와 sync 키가 지워지고 navigate가 카카오 로그아웃 주소로 불린다
  - `logout-unsynced-asks`: Redis fail에 dirty가 있으면 `{ok:false, reason:"unsynced"}`이고 아무것도 지우지 않는다. `force:true`면 지운다
  - `withdraw-clears`: withdrawAccount → 다섯 키 없음, 계정 키 없음. 다른 브라우저 A가 syncNow하면 401 → A의 사본도 지워진다
  - `storage-unavailable-no-throw`: localStorage.setItem이 던지면 syncNow는 예외 없이 끝난다
- [ ] **Step 2: 실행해 실패를 본다.**
- [ ] **Step 3: `accountSync.ts`, `useAccount.ts`를 만들고 profile.ts 주석을 고친다.**
  - 브라우저 값을 쓸 때는 각 저장소의 `write`를 써서 화면이 다시 그려지게 한다.
  - dirty 상태는 `kireumalimi.sync`에 `{tag, dirty}`로 둔다.
- [ ] **Step 4: 통과를 본다.** Task 1~5 시험도 다시 돌린다. tsc, eslint.
- [ ] **Step 5: 커밋** `feat(account): 브라우저와 계정 동기화`

### Task 7: 화면 — 로그인 블록, 머리글, 안내 한 줄

> 시작 전: feat/guest-location이 main에 병합됐는지 본다. 병합됐으면 `git rebase origin/main`을 한다. 아니면 그 세션에 LoginForm·AppShell 상황을 묻고, 겹치는 줄을 피해 작업한다. rebase는 병합 뒤 한다.

**Files:**
- Create: `src/components/AccountPanel.tsx`(로그인 블록, 로그인 상태, 로그아웃, 탈퇴 확인), `src/components/AccountNotice.tsx`
- Modify: `src/components/LoginForm.tsx`(머리말 제목·설명, 맨 위에 `<AccountPanel part="top" />`, 아래 버튼 줄, 맨 아래 안내 문구, 게스트용 '이 브라우저의 내 정보 지우기')
- Modify: `src/components/AppShell.tsx`(머리글 로그인 버튼과 아바타는 `useAccount().status`로 정한다. `<main>` 맨 위에 `<AccountNotice />`)
- Test: 브라우저 확인(preview) + `$T/fake-services.mjs`(가짜 카카오 인가·토큰·user/me·unlink·logout과 가짜 Upstash REST를 한 포트 3399에서)

**Interfaces:**
- Consumes: `useAccount`, `logoutAccount`, `withdrawAccount`, `dismissNotice`(Task 6), `savedLedgerAll`(탈퇴 확인의 기록 수)
- Produces: `AccountPanel({ part }: { part: "top" | "actions" })`, `AccountNotice()`

- 정해진 모양
  - 카카오 버튼은 카카오 로그인 디자인 가이드를 따른다.
    - 배경 `#FEE500`, 글자·심볼 `#000000`(글자는 85% 불투명).
    - 문구 "카카오 로그인", 말풍선 심볼은 SVG.
    - `<a href="/api/auth/kakao">`.
  - status가 `unknown`이면 버튼 자리를 같은 높이로 비워 둔다. `unavailable`이면 "카카오 로그인 준비 중이에요"를 보인다.
  - 탈퇴 확인은 같은 자리에 펼친다. 확인 문구는 설계 문서 그대로이고, `N`은 `savedLedgerAll().length`.
  - 로그아웃이 `unsynced`면 설계 문서의 문구와 [다시 시도]·[그래도 로그아웃].
  - 머리글: `account`면 아바타(이름 첫 글자. 이름이 없으면 닉네임 첫 글자), 아니면 '로그인' 버튼. `unknown`이면 지금의 빈 아바타 자리 표시.

- [ ] **Step 1: 화면 코드를 쓴다.**
- [ ] **Step 2: tsc, eslint, `npm run build`.** `/api/account`와 `/api/auth/*`가 ƒ(동적)인지 빌드 출력에서 본다.
- [ ] **Step 3: 가짜 서비스로 브라우저 확인**
  - 준비: `.env.local`에 가짜 값과 `KAKAO_AUTH_BASE=http://localhost:3399`, `KAKAO_API_BASE=http://localhost:3399`, `UPSTASH_REDIS_REST_URL=http://localhost:3399`을 넣는다. 가짜 값은 시험용 무작위이고 이용자의 실제 키가 아니다. `.claude/launch.json`에는 내 이름의 항목만 더하고 빼며, 다른 항목은 건드리지 않는다.
  - 확인할 장면:
    1. 게스트 화면이 그대로 동작한다.
    2. /login에 카카오 버튼이 있다.
    3. 게스트로 장부를 남기고 로그인하면 '…건을 계정에 합쳤어요'가 보인다.
    4. 새 탭(다른 브라우저 프로필 대신 localStorage 비우기)으로 로그인하면 같은 기록이 보인다.
    5. 로그아웃하면 기록이 지워지고 다시 로그인하면 돌아온다.
    6. 탈퇴하면 가짜 Redis에 키가 없다.
    7. 휴대폰 폭(375px)에서 버튼과 확인 창이 넘치지 않는다.
  - 환경변수를 비우면 '준비 중'이 보이고 나머지는 그대로다.
- [ ] **Step 4: 스크린샷을 남긴다.** 로그인 화면, 내 정보, 탈퇴 확인, 휴대폰 폭.
- [ ] **Step 5: 커밋** `feat(account): 로그인 화면과 머리글을 카카오 계정으로`

### Task 8: 처리방침, 환경변수 예시, 문서, PR

**Files:**
- Modify: `src/app/privacy/page.tsx`(guest-location이 만든 페이지. 설계 문서의 '개인정보 처리방침에 더할 것' 표를 모두 반영하고, "서버는 저장하지 않음"을 고친다)
- Modify: `.env.example`(이름과 한 줄 설명만), `README.md`(간편 로그인 문단 → 카카오 계정, 설정 순서), `PRODUCT.md`(한 줄), `DESIGN.md`(로그인 화면·머리글 한 줄)
- Test: 문서이므로 시험 없음. 마지막에 전체 시험·빌드

- [ ] **Step 1: 처리방침과 문서를 고친다.**
  - 보관 지역은 '도쿄(DB를 만들 때 고른 지역으로 맞춤)'로 쓴다.
  - 운영 주체와 문의처는 guest-location 페이지에 있는 그대로 둔다.
- [ ] **Step 2: 전체 확인**: `$T/acct-*.mjs` 여섯 개 모두 통과, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] **Step 3: 커밋** `docs(account): 처리방침·환경변수·문서`
- [ ] **Step 4: 브랜치 전체 검토**: 새 검토자에게 `git diff origin/main...HEAD`를 맡긴다. 중요한 지적은 고친다.
- [ ] **Step 5: push하고 PR을 연다.**
  - 본문에 넣을 것: 무엇이 바뀌는지, 이용자·팀원이 할 일(카카오, Upstash, Vercel 환경변수) 단계, 시험 결과, 확인 못 한 것(진짜 카카오, 운영).
  - 본문 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
  - 그 뒤 `get_status`. 병합은 이용자가 허락할 때만 한다.
