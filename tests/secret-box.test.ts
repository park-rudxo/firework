import { beforeAll, describe, expect, it } from "vitest";

/**
 * 웹훅 주소는 그 자체가 "이 사람에게 메시지를 보낼 수 있는 권한" 이다.
 * DB 덤프 한 번이 곧 전원에게 아무 메시지나 보낼 수 있는 상태가 되면 안 된다.
 */
describe("비밀 상자", () => {
  let seal: (v: string) => string;
  let open: (v: string | null | undefined) => string | null;

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-at-least-sixteen-characters";
    process.env.DATABASE_URL ??= "postgresql://unused";
    const mod = await import("@/lib/secret-box");
    seal = mod.seal;
    open = mod.open;
  });

  it("봉했다 열면 원래 값이 나온다", () => {
    const secret = "https://meeting.ssafy.test/hooks/abcdef123456";
    expect(open(seal(secret))).toBe(secret);
  });

  it("봉한 값에 평문이 남지 않는다", () => {
    const sealed = seal("https://meeting.ssafy.test/hooks/abcdef123456");
    expect(sealed).not.toContain("hooks");
    expect(sealed).not.toContain("ssafy");
  });

  it("같은 값을 두 번 봉해도 결과가 다르다", () => {
    // 매번 같은 결과가 나오면 어느 두 사람이 같은 웹훅을 쓰는지가 드러난다.
    expect(seal("같은 값")).not.toBe(seal("같은 값"));
  });

  it("한 글자만 바꿔도 열리지 않는다", () => {
    const sealed = seal("원본");
    const parts = sealed.split(".");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0] = body[0]! ^ 0xff;
    parts[3] = body.toString("base64url");
    expect(open(parts.join("."))).toBeNull();
  });

  it("열 수 없으면 던지지 않고 null 을 준다", () => {
    // 발송 경로 한가운데에서 예외가 나면 알림 하나 때문에 원래 작업까지 깨진다.
    expect(open(null)).toBeNull();
    expect(open("")).toBeNull();
    expect(open("아무 문자열")).toBeNull();
    expect(open("v2.a.b.c")).toBeNull();
  });
});
