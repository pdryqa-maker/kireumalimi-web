// 비밀번호는 scrypt 해시로만 둔다. 원문은 어디에도 저장하거나 기록하지 않는다.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

export type PasswordHash = { alg: "scrypt"; N: number; r: number; p: number; salt: string; hash: string };

const PARAMS = { N: 32_768, r: 8, p: 1 };
const KEY_LENGTH = 32;
const MAX_MEM = 64 * 1024 * 1024;
export const PASSWORD_LIMITS = { min: 8, max: 64 };

function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number }, length: number) {
  const options: ScryptOptions = { ...params, maxmem: MAX_MEM };
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, length, options, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, PARAMS, KEY_LENGTH);
  return { alg: "scrypt", ...PARAMS, salt: salt.toString("base64"), hash: hash.toString("base64") };
}

// 저장된 값이 우리 형식이 아니면(빈 값, 다른 방식, 너무 약한 설정) 맞지 않는 것으로 본다.
export async function verifyPassword(password: string, stored: unknown) {
  const item = stored as Partial<PasswordHash> | null;
  if (
    item?.alg !== "scrypt" ||
    item.N !== PARAMS.N ||
    item.r !== PARAMS.r ||
    item.p !== PARAMS.p ||
    typeof item.salt !== "string" ||
    typeof item.hash !== "string"
  ) {
    return false;
  }
  const salt = Buffer.from(item.salt, "base64");
  const expected = Buffer.from(item.hash, "base64");
  if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, salt, PARAMS, KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}

// 아이디: 영문 소문자와 숫자 4~20자. 대문자는 소문자로 바꾼다.
export function cleanLoginId(value: unknown) {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return /^[a-z0-9]{4,20}$/.test(id) ? id : null;
}

export const isPassword = (value: unknown): value is string =>
  typeof value === "string" && value.length >= PASSWORD_LIMITS.min && value.length <= PASSWORD_LIMITS.max;
