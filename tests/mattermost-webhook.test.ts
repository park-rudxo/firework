import { beforeAll, describe, expect, it } from "vitest";

/**
 * 등록받은 웹훅 주소를 검사하지 않으면, 임의의 주소를 넣어 우리 서버가 그쪽으로
 * POST 를 날리게 만들 수 있다. 내부망 주소를 넣으면 그대로 SSRF 다.
 */
describe("웹훅 주소 검사", () => {
  let parseWebhookUrl: (raw: string) => URL;
  let MattermostError: new (m?: string) => Error;

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-at-least-sixteen-characters";
    process.env.DATABASE_URL ??= "postgresql://unused";
    process.env.MATTERMOST_URL = "https://meeting.ssafy.test";
    const mod = await import("@/features/mattermost/client");
    parseWebhookUrl = mod.parseWebhookUrl;
    MattermostError = mod.MattermostError;
  });

  it("우리가 아는 서버의 /hooks/ 주소만 통과한다", () => {
    const url = parseWebhookUrl("https://meeting.ssafy.test/hooks/abcdef123456");
    expect(url.host).toBe("meeting.ssafy.test");
  });

  it("다른 호스트는 거절한다", () => {
    expect(() => parseWebhookUrl("https://evil.test/hooks/abcdef")).toThrow(MattermostError);
  });

  it("내부망 주소도 호스트가 다르므로 거절된다", () => {
    expect(() => parseWebhookUrl("http://169.254.169.254/hooks/x")).toThrow(MattermostError);
    expect(() => parseWebhookUrl("http://localhost:5432/hooks/x")).toThrow(MattermostError);
  });

  it("같은 서버라도 /hooks/ 가 아니면 거절한다", () => {
    // 이걸 허용하면 우리 서버로 임의의 Mattermost API 를 때리게 만들 수 있다.
    expect(() => parseWebhookUrl("https://meeting.ssafy.test/api/v4/users")).toThrow(MattermostError);
    expect(() => parseWebhookUrl("https://meeting.ssafy.test/hooks/")).toThrow(MattermostError);
  });

  it("주소 형식이 아니면 거절한다", () => {
    expect(() => parseWebhookUrl("hooks/abcdef")).toThrow(MattermostError);
  });
});
