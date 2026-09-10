import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

import { serverEnv } from "@/lib/env";

/**
 * 짧은 비밀 문자열을 봉했다 여는 상자.
 *
 * Mattermost 개인 웹훅 주소를 담으려고 만들었다. 그 주소는 그 자체가
 * "이 사람에게 메시지를 보낼 수 있는 권한" 이라 비밀번호에 가깝다. DB 덤프 한 번이
 * 곧 전원에게 아무 메시지나 보낼 수 있는 상태가 되면 안 된다.
 *
 * 키는 BETTER_AUTH_SECRET 에서 파생한다. 변수를 하나 더 만들면 배포할 때 비워두기
 * 쉽고, 비워두면 조용히 평문으로 저장하는 코드가 생긴다. 그럴 바에는 이미 반드시
 * 있어야 하는 값에서 뽑는 편이 낫다. 대신 그 값이 바뀌면 봉해둔 것을 열 수 없으므로
 * open() 은 실패를 예외가 아니라 null 로 돌려주고, 호출부는 "연결이 풀렸다" 로 다룬다.
 */
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT = "firework/secret-box/v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = scryptSync(serverEnv().BETTER_AUTH_SECRET, SALT, KEY_LENGTH);
  return cachedKey;
}

/** 평문을 봉한다. 결과는 `v1.{iv}.{tag}.{ciphertext}` 형태의 base64url 묶음이다. */
export function seal(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

/**
 * 봉한 것을 연다. 열 수 없으면 null 이다.
 *
 * 키가 바뀌었거나 값이 손상된 경우가 여기로 온다. 던지지 않는 이유는, 발송 경로
 * 한가운데에서 예외가 나면 알림 하나 때문에 원래 작업까지 깨지기 때문이다.
 */
export function open(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;

  try {
    const iv = Buffer.from(parts[1]!, "base64url");
    const tag = Buffer.from(parts[2]!, "base64url");
    const body = Buffer.from(parts[3]!, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
