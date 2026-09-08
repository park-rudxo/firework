import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * serverEnv 는 한 번 읽은 값을 캐시하므로, 케이스마다 모듈을 새로 들여온다.
 */
const ORIGINAL = { ...process.env };

async function load(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    ...overrides,
  });
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete process.env[k];
  return import("@/lib/env");
}

afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in ORIGINAL)) delete process.env[k];
  Object.assign(process.env, ORIGINAL);
  vi.resetModules();
});

describe("BETTER_AUTH_URL", () => {
  it("안 넣으면 로컬 주소로 떨어진다", async () => {
    const { serverEnv } = await load({ BETTER_AUTH_URL: undefined });
    expect(serverEnv().BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  it("이름만 만들고 값을 비워둔 것도 안 넣은 것과 같다", async () => {
    // 호스팅 화면에서 흔한 실수다. 빈 문자열이 그대로 오면 "Invalid URL" 로 빌드가 죽는데,
    // 로그만 봐서는 무엇을 비워뒀는지 알기 어렵다.
    const { serverEnv } = await load({ BETTER_AUTH_URL: "   " });
    expect(serverEnv().BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  it("주소를 넣으면 그대로 쓴다", async () => {
    const { serverEnv } = await load({ BETTER_AUTH_URL: "https://firework.vercel.app" });
    expect(serverEnv().BETTER_AUTH_URL).toBe("https://firework.vercel.app");
  });

  it("주소가 아니면 막는다", async () => {
    const { serverEnv } = await load({ BETTER_AUTH_URL: "firework.vercel.app" });
    expect(() => serverEnv()).toThrow(/BETTER_AUTH_URL/);
  });
});

describe("선택 값", () => {
  it("공백만 든 자격증명은 설정된 것으로 보지 않는다", async () => {
    const { configuredProviders, serverEnv } = await load({
      GITHUB_CLIENT_ID: "  ",
      GITHUB_CLIENT_SECRET: "  ",
    });
    expect(configuredProviders(serverEnv()).github).toBe(false);
  });

  it("양쪽 다 채워야 설정된 것으로 본다", async () => {
    const { configuredProviders, serverEnv } = await load({
      GITHUB_CLIENT_ID: "id",
      GITHUB_CLIENT_SECRET: "secret",
    });
    expect(configuredProviders(serverEnv()).github).toBe(true);
  });

  it("관리자 목록이 비어 있으면 아무도 승격되지 않는다", async () => {
    const { bootstrapAdminEmails, serverEnv } = await load({ ADMIN_EMAILS: " " });
    expect(bootstrapAdminEmails(serverEnv())).toEqual([]);
  });
});
