// 계정 기능 설정. 운영은 Upstash Redis와 AUTH_SECRET이 모두 있어야 켜진다(없으면 로그인 '준비 중').
// 개발(NODE_ENV가 production이 아님)에서 값이 없으면 작업 폴더의 .data/에 저장해, 준비 없이 가입·로그인을 시험할 수 있게 한다.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AccountConfig = {
  secret: string;
  store: { kind: "rest"; url: string; token: string } | { kind: "file"; path: string };
};

const MIN_SECRET = 32;

function devSecret(dir: string) {
  const file = join(dir, "secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(dir, { recursive: true });
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(file, `${secret}\n`, { mode: 0o600 });
  return secret;
}

export function accountConfig(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): AccountConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const production = env.NODE_ENV === "production";
  const dataDir = join(cwd, ".data");
  const secret = env.AUTH_SECRET || (production ? "" : devSecret(dataDir));
  if (secret.length < MIN_SECRET) return null;
  if (url && token) return { secret, store: { kind: "rest", url, token } };
  return production ? null : { secret, store: { kind: "file", path: join(dataDir, "accounts.json") } };
}
