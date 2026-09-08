import { describe, expect, it } from "vitest";

import {
  checkCode,
  codeMatches,
  cooldownRemainingMs,
  generateCode,
  hashCode,
  identifierFor,
  MAX_ATTEMPTS,
  newPayload,
  parsePayload,
  RESEND_COOLDOWN_MS,
  serialize,
} from "@/features/verification/code";

describe("인증 코드 생성", () => {
  it("항상 6자리 숫자다", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("앞자리가 0 이어도 잘려나가지 않는다", () => {
    // 000123 을 숫자로 다루면 123 이 된다. 자릿수가 줄면 그만큼 추측하기 쉬워진다.
    const codes = Array.from({ length: 3000 }, () => generateCode());
    expect(codes.every((c) => c.length === 6)).toBe(true);
  });

  it("같은 코드가 연달아 나오지 않는다", () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateCode()));
    // 6자리 공간에서 1000개를 뽑으면 충돌이 조금 나올 수 있으나 대부분은 달라야 한다.
    expect(codes.size).toBeGreaterThan(950);
  });
});

describe("저장 형태", () => {
  it("평문 코드를 저장하지 않는다", () => {
    // DB 를 읽을 수 있는 사람이 남의 계정을 인증해버릴 수 있으면 안 된다.
    const code = "123456";
    const stored = serialize(newPayload(code));
    expect(stored).not.toContain(code);
    expect(stored).toContain(hashCode(code));
  });

  it("직렬화한 것을 되읽을 수 있다", () => {
    const payload = newPayload("654321");
    expect(parsePayload(serialize(payload))).toEqual(payload);
  });

  it("깨진 값은 null 로 돌려준다", () => {
    expect(parsePayload("not json")).toBeNull();
    expect(parsePayload("{}")).toBeNull();
    expect(parsePayload('{"codeHash":123}')).toBeNull();
  });

  it("사용자마다 다른 식별자를 쓴다", () => {
    expect(identifierFor("a")).not.toBe(identifierFor("b"));
    expect(identifierFor("a")).toContain("a");
  });
});

describe("코드 대조", () => {
  it("맞는 코드를 통과시킨다", () => {
    expect(codeMatches("111111", newPayload("111111"))).toBe(true);
  });

  it("틀린 코드를 막는다", () => {
    const payload = newPayload("111111");
    for (const wrong of ["111112", "211111", "000000", "11111", "1111111", ""]) {
      expect(codeMatches(wrong, payload)).toBe(false);
    }
  });
});

describe("확인 절차", () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 1);

  it("맞으면 ok", () => {
    expect(checkCode("123456", newPayload("123456"), future).status).toBe("ok");
  });

  it("만료됐으면 코드가 맞아도 거절한다", () => {
    expect(checkCode("123456", newPayload("123456"), past).status).toBe("expired");
  });

  it("틀리면 시도 횟수를 하나 올린다", () => {
    const result = checkCode("000000", newPayload("123456"), future);
    expect(result.status).toBe("mismatch");
    if (result.status !== "mismatch") return;
    expect(result.next.attempts).toBe(1);
    expect(result.attemptsLeft).toBe(MAX_ATTEMPTS - 1);
  });

  it("시도 횟수를 넘기면 맞는 코드도 거절한다", () => {
    // 6자리는 제한이 없으면 결국 뚫린다.
    const payload = { ...newPayload("123456"), attempts: MAX_ATTEMPTS };
    expect(checkCode("123456", payload, future).status).toBe("locked");
  });

  it("틀린 코드를 반복하면 정확히 MAX_ATTEMPTS 번에서 잠긴다", () => {
    let payload = newPayload("123456");
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const result = checkCode("000000", payload, future);
      expect(result.status).toBe("mismatch");
      if (result.status !== "mismatch") return;
      payload = result.next;
    }
    expect(checkCode("000000", payload, future).status).toBe("locked");
    expect(checkCode("123456", payload, future).status).toBe("locked");
  });
});

describe("재발송 간격", () => {
  it("막 보낸 직후에는 기다려야 한다", () => {
    const now = Date.now();
    expect(cooldownRemainingMs(newPayload("123456", now), now)).toBe(RESEND_COOLDOWN_MS);
  });

  it("간격이 지나면 0 이다", () => {
    const now = Date.now();
    const payload = newPayload("123456", now - RESEND_COOLDOWN_MS);
    expect(cooldownRemainingMs(payload, now)).toBe(0);
  });

  it("시간이 거꾸로 가도 음수가 되지 않는다", () => {
    const now = Date.now();
    expect(cooldownRemainingMs(newPayload("123456", now + 10_000), now)).toBeLessThanOrEqual(
      RESEND_COOLDOWN_MS,
    );
  });
});
