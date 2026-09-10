import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  viewer: vi.fn(), cookie: vi.fn(), configured: vi.fn(),
  db: { verification: { deleteMany: vi.fn() }, mattermostIdentity: { findUnique: vi.fn(), upsert: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ db: mock.db }));
vi.mock("@/lib/session", () => ({ getViewer: mock.viewer }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ BETTER_AUTH_URL: "https://firework.example" }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mock.cookie }) }));
vi.mock("@/features/mattermost/config", () => ({ MATTERMOST_ORIGIN: "https://meeting.ssafy.com", mattermostOAuthConfigured: mock.configured }));
import { GET } from "@/app/api/mattermost/callback/route";
import { stateHash } from "@/features/mattermost/oauth";
beforeEach(() => {
  vi.resetAllMocks();
  mock.viewer.mockResolvedValue({ id: "local-user" });
  mock.cookie.mockReturnValue({ value: "state" });
  mock.configured.mockReturnValue(true);
  mock.db.verification.deleteMany.mockResolvedValue({ count: 1 });
});
describe("OAuth identity verification", () => {
  it("rejects a mismatched state without consuming any token", async () => {
    const response = await GET(new Request("https://firework.example/api/mattermost/callback?state=wrong&code=secret"));
    expect(response.headers.get("location")).toContain("result=invalid");
    expect(mock.db.verification.deleteMany).not.toHaveBeenCalled();
  });
  it("rejects replayed or expired state", async () => {
    mock.db.verification.deleteMany.mockResolvedValue({ count: 0 });
    const response = await GET(new Request("https://firework.example/api/mattermost/callback?state=state&code=secret"));
    expect(response.headers.get("location")).toContain("result=invalid");
    expect(mock.db.verification.deleteMany.mock.calls[0]![0].where).toMatchObject({ id: stateHash("state"), value: "local-user" });
  });
  it("persists only server verified identity, with no OAuth token or notification opt-in", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "do-not-store" }))
      .mockResolvedValueOnce(Response.json({ id: "a".repeat(26), username: "student", delete_at: 0 }));
    vi.stubGlobal("fetch", fetch);
    const response = await GET(new Request("https://firework.example/api/mattermost/callback?state=state&code=secret"));
    expect(response.headers.get("location")).toContain("result=connected");
    expect(mock.db.mattermostIdentity.upsert.mock.calls[0]![0].create).toEqual({
      userId: "local-user", mattermostUserId: "a".repeat(26), username: "student",
    });
    expect(JSON.stringify(mock.db.mattermostIdentity.upsert.mock.calls)).not.toContain("do-not-store");
    vi.unstubAllGlobals();
  });
});

