// 로그인 세션: 아이디와 만료 시각을 AUTH_SECRET으로 서명해 httpOnly 쿠키에 둔다. 서버에는 세션을 따로 저장하지 않는다.
export type Session = { sub: string; iat: number; exp: number }; // 초 단위

export const SESSION_COOKIE = "kireumalimi_session";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30일. 늘려 주지 않는다

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function hmac(secret: string, text: string) {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(text)));
}

export async function signSession(session: Session, secret: string) {
  const body = toBase64Url(encoder.encode(JSON.stringify(session)));
  return `${body}.${toBase64Url(await hmac(secret, body))}`;
}

export async function verifySession(token: string | undefined, secret: string, nowSec: number): Promise<Session | null> {
  const parts = token?.split(".") ?? [];
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const signatureBytes = fromBase64Url(signature);
  const bodyBytes = fromBase64Url(body);
  if (!signatureBytes || !bodyBytes || !body) return null;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), signatureBytes, encoder.encode(body));
  if (!valid) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(bodyBytes));
    const ok =
      typeof value?.sub === "string" &&
      value.sub !== "" &&
      Number.isInteger(value.iat) &&
      Number.isInteger(value.exp) &&
      nowSec < value.exp;
    return ok ? { sub: value.sub, iat: value.iat, exp: value.exp } : null;
  } catch {
    return null;
  }
}

// 이 브라우저의 사본이 어느 계정 것인지 가리는 값. 가입 시각을 섞어, 탈퇴한 아이디를 다시 가입하면 다른 값이 된다.
export async function accountTag(id: string, createdAt: number, secret: string) {
  const bytes = await hmac(secret, `${id}:${createdAt}`);
  return Array.from(bytes.slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// 길이가 같으면 끝까지 비교해 걸린 시간으로 값이 새지 않게 한다.
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
