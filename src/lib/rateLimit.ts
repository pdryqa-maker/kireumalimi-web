// 공개 주소로 열려 있어 인증키 한도(오피넷 하루 300회)와 Claude 비용을 지키기 위한 호출 제한.
// 서버 메모리에 세므로 Vercel 인스턴스마다 따로 센다. 정확한 전체 제한이 필요하면 공유 저장소(KV 등)로 옮겨야 한다.
const windows = new Map<string, number[]>();

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

// 한 사람(IP)당 10분 한도와, 인스턴스 전체의 하루 한도.
export const LIMITS = {
  chat: { max: 15, windowMs: 10 * MINUTE },
  chatDaily: { max: 200, windowMs: DAY },
  data: { max: 60, windowMs: 10 * MINUTE },
  opinetDaily: { max: 250, windowMs: DAY },
};

export function take(name: string, key: string, limit: { max: number; windowMs: number }) {
  const now = Date.now();
  const id = `${name}:${key}`;
  const hits = (windows.get(id) ?? []).filter((time) => now - time < limit.windowMs);
  const allowed = hits.length < limit.max;
  if (allowed) hits.push(now);
  windows.set(id, hits);
  if (windows.size > 5000) {
    for (const [other, times] of windows) {
      if (times.every((time) => now - time >= DAY)) windows.delete(other);
    }
  }
  return allowed;
}

export function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
}

const TOO_MANY = "요청이 많아요. 잠시 뒤 다시 시도해 주세요.";

// 한도를 넘으면 429 응답을, 아니면 null을 돌려준다.
export function limitByClient(request: Request, name: keyof typeof LIMITS) {
  return take(name, clientKey(request), LIMITS[name]) ? null : Response.json({ error: TOO_MANY }, { status: 429 });
}

export function limitDaily(name: keyof typeof LIMITS, message: string) {
  return take(name, "all", LIMITS[name]) ? null : Response.json({ error: message }, { status: 429 });
}
