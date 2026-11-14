// 라우트 핸들러가 Request 머리글에서 쿠키를 읽고 Set-Cookie 글을 만든다. next/headers 없이 써서 node로 시험할 수 있다.
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function cookieHeader(name: string, value: string, opts: { maxAge: number; secure: boolean }) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${opts.maxAge}; HttpOnly; SameSite=Lax${opts.secure ? "; Secure" : ""}`;
}

export function clearCookieHeader(name: string, opts: { secure: boolean }) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${opts.secure ? "; Secure" : ""}`;
}
