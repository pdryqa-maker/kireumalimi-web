// 계정 저장소. 운영은 Upstash Redis REST API를 fetch로 부르고, 개발은 .data/accounts.json 파일로 같은 명령을 흉내 낸다.
// 쓰는 명령은 HGETALL, HSET, HSETNX, DEL, EXPIRE, INCR뿐이다.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AccountConfig } from "./config";

export type Redis = {
  hgetall(key: string): Promise<Record<string, string> | null>;
  hset(key: string, fields: Record<string, string>): Promise<void>;
  hsetnx(key: string, field: string, value: string): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
  incr(key: string): Promise<number>;
};

export class RedisError extends Error {}

export function restRedis(url: string, token: string, fetchImpl: typeof fetch = fetch): Redis {
  async function call(command: (string | number)[]) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(command),
        cache: "no-store",
      });
    } catch {
      throw new RedisError("저장소에 연결하지 못했습니다.");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || "error" in body) throw new RedisError(`저장소 오류 (${response.status})`);
    return body.result as unknown;
  }
  return {
    async hgetall(key) {
      const result = await call(["HGETALL", key]);
      if (!Array.isArray(result) || result.length === 0) return null;
      const hash: Record<string, string> = {};
      for (let i = 0; i + 1 < result.length; i += 2) hash[String(result[i])] = String(result[i + 1]);
      return hash;
    },
    async hset(key, fields) {
      await call(["HSET", key, ...Object.entries(fields).flat()]);
    },
    async hsetnx(key, field, value) {
      return (await call(["HSETNX", key, field, value])) === 1;
    },
    async del(...keys) {
      if (keys.length) await call(["DEL", ...keys]);
    },
    async expire(key, seconds) {
      await call(["EXPIRE", key, seconds]);
    },
    async incr(key) {
      return Number(await call(["INCR", key]));
    },
  };
}

type FileItem = { type: "hash"; value: Record<string, string>; expiresAt: number | null } | { type: "num"; value: number; expiresAt: number | null };

// 개발 전용. 한 번에 한 사람이 시험하는 용도라 잠금 없이 읽고 통째로 다시 쓴다(임시 파일에 쓴 뒤 바꿔 끼움).
export function fileRedis(path: string, now: () => number = Date.now): Redis {
  const load = (): Record<string, FileItem> => {
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return {};
    }
  };
  const save = (data: Record<string, FileItem>) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.tmp`, JSON.stringify(data));
    renameSync(`${path}.tmp`, path);
  };
  const live = (data: Record<string, FileItem>, key: string) => {
    const item = data[key];
    if (item && item.expiresAt !== null && item.expiresAt <= now()) delete data[key];
    return data[key];
  };
  const hashOf = (data: Record<string, FileItem>, key: string) => {
    const item = live(data, key);
    if (item?.type === "hash") return item;
    const fresh: FileItem = { type: "hash", value: {}, expiresAt: null };
    data[key] = fresh;
    return fresh;
  };
  return {
    async hgetall(key) {
      const item = live(load(), key);
      return item?.type === "hash" && Object.keys(item.value).length ? { ...item.value } : null;
    },
    async hset(key, fields) {
      const data = load();
      Object.assign(hashOf(data, key).value, fields);
      save(data);
    },
    async hsetnx(key, field, value) {
      const data = load();
      const item = hashOf(data, key);
      if (field in item.value) return false;
      item.value[field] = value;
      save(data);
      return true;
    },
    async del(...keys) {
      const data = load();
      for (const key of keys) delete data[key];
      save(data);
    },
    async expire(key, seconds) {
      const data = load();
      const item = live(data, key);
      if (item) item.expiresAt = now() + seconds * 1000;
      save(data);
    },
    async incr(key) {
      const data = load();
      const item = live(data, key);
      const value = (item?.type === "num" ? item.value : 0) + 1;
      data[key] = { type: "num", value, expiresAt: item?.type === "num" ? item.expiresAt : null };
      save(data);
      return value;
    },
  };
}

export const redisFor = (config: AccountConfig): Redis =>
  config.store.kind === "rest" ? restRedis(config.store.url, config.store.token) : fileRedis(config.store.path);
