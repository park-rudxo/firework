import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/**
 * 이메일 인증 코드의 순수 로직.
 *
 * DB 와 세션에서 떼어놓아야 "평문을 저장하지 않는다", "시도 횟수를 센다" 같은 것을
 * 테스트로 못박을 수 있다. 저장과 발송은 actions.ts 가 맡는다.
 */

/** 코드 유효 시간. 짧으면 메일이 늦게 올 때 불편하고, 길면 무차별 대입에 시간을 준다. */
export const CODE_TTL_MS = 10 * 60 * 1000;

/** 한 코드로 시도할 수 있는 횟수. 6자리라 제한이 없으면 결국 뚫린다. */
export const MAX_ATTEMPTS = 5;

/** 재발송 간격. 같은 사람이 메일 폭탄을 돌리지 못하게 한다. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

export type Payload = { codeHash: string; attempts: number; sentAt: number };

export const identifierFor = (userId: string) => `email-verify:${userId}`;

/** 코드는 평문으로 두지 않는다. DB 를 읽을 수 있으면 남의 계정을 인증해버릴 수 있다. */
export const hashCode = (code: string) => createHash("sha256").update(code, "utf8").digest("hex");

/** 6자리. randomInt 는 모듈러 편향 없이 균등하게 뽑는다. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function newPayload(code: string, now = Date.now()): Payload {
  return { codeHash: hashCode(code), attempts: 0, sentAt: now };
}

export function serialize(payload: Payload): string {
  return JSON.stringify(payload);
}

export function parsePayload(value: string): Payload | null {
  try {
    const p = JSON.parse(value) as Payload;
    return typeof p.codeHash === "string" && typeof p.attempts === "number" ? p : null;
  } catch {
    return null;
  }
}

/**
 * 재발송까지 남은 시간.
 *
 * 아래로만 자르면 안 된다. sentAt 이 미래면(시계 오차, 손상된 값) 남은 시간이
 * 의도한 간격보다 길어져 사용자를 필요 이상으로 묶어둔다. 위아래 모두 자른다.
 */
export function cooldownRemainingMs(payload: Payload, now = Date.now()): number {
  const elapsed = now - payload.sentAt;
  return Math.min(RESEND_COOLDOWN_MS, Math.max(0, RESEND_COOLDOWN_MS - elapsed));
}

/** 입력한 코드가 맞는지. 길이가 같으므로 timingSafeEqual 을 그대로 쓸 수 있다. */
export function codeMatches(input: string, payload: Payload): boolean {
  const a = Buffer.from(hashCode(input), "hex");
  const b = Buffer.from(payload.codeHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type CheckResult =
  | { status: "ok" }
  | { status: "expired" }
  | { status: "locked" }
  | { status: "mismatch"; attemptsLeft: number; next: Payload };

/**
 * 코드 한 번 확인. 상태 전이를 여기서 다 결정하고, 호출부는 그 결과대로 쓰기만 한다.
 */
export function checkCode(
  input: string,
  payload: Payload,
  expiresAt: Date,
  now = new Date(),
): CheckResult {
  if (expiresAt < now) return { status: "expired" };
  if (payload.attempts >= MAX_ATTEMPTS) return { status: "locked" };
  if (codeMatches(input, payload)) return { status: "ok" };

  const next = { ...payload, attempts: payload.attempts + 1 };
  return { status: "mismatch", attemptsLeft: MAX_ATTEMPTS - next.attempts, next };
}
