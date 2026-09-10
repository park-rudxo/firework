import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
export const STATE_COOKIE = "firework-mm-state";
export function stateHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function sameSecret(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

