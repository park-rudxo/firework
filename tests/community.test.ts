import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() });
  return { db: { projectFollow: model(), projectMember: model(), projectUpdate: model(), bugReport: model(), notification: model(), mattermostDelivery: model(), mattermostIdentity: model(), $transaction: vi.fn() }, viewer: vi.fn(), access: vi.fn(), configured: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/session", () => ({ requireViewer: mocks.viewer }));
vi.mock("@/features/community/access", () => ({ projectAccess: mocks.access, CommunityError: class extends Error {} }));
vi.mock("@/features/mattermost/config", () => ({ mattermostDeliveryConfigured: mocks.configured }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { setSubscription, publishUpdate, submitBug, updateBug, setBugNotifications, setManagementNotifications } from "@/features/community/actions";
import { canManage, consentAllows } from "@/features/community/policy";
const form = (data: Record<string, string>) => { const f = new FormData(); Object.entries(data).forEach(([k,v]) => f.set(k,v)); return f; };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.$transaction.mockImplementation(fn => fn(mocks.db));
  mocks.viewer.mockResolvedValue({ id: "viewer" });
  mocks.access.mockResolvedValue({ project: { id: "project", status: "PUBLISHED", ownerId: "owner" }, manager: false });
  mocks.configured.mockReturnValue(true);
  mocks.db.mattermostIdentity.findUnique.mockResolvedValue({ mattermostUserId: "mm" });
});
describe("opt-in subscription", () => {
  it("subscribing alone creates no message consent or delivery", async () => {
    const result = await setSubscription("app", { error: null }, form({ subscribed: "on" }));
    expect(result.error).toBeNull();
    expect(mocks.db.projectFollow.upsert.mock.calls[0]![0].create).toMatchObject({ notifyUpdates: false, notifyRecruitment: false });
    expect(mocks.db.mattermostDelivery.createMany).not.toHaveBeenCalled();
  });
  it("unsubscribing ignores checked message types and cancels outstanding deliveries", async () => {
    await setSubscription("app", { error: null }, form({ updates: "on", recruitment: "on" }));
    expect(mocks.db.projectFollow.deleteMany).toHaveBeenCalledWith({ where: { projectId: "project", userId: "viewer" } });
    expect(mocks.db.projectFollow.upsert).not.toHaveBeenCalled();
    expect(mocks.db.mattermostDelivery.updateMany.mock.calls[0]![0].data.status).toBe("CANCELLED");
  });
  it("rejects external notification opt-in without identity or server configuration", async () => {
    mocks.configured.mockReturnValue(false);
    expect((await setSubscription("app", { error: null }, form({ subscribed: "on", updates: "on" }))).error).toBeTruthy();
    expect(mocks.db.projectFollow.upsert).not.toHaveBeenCalled();
    mocks.configured.mockReturnValue(true);
    mocks.db.mattermostIdentity.findUnique.mockResolvedValue(null);
    expect((await setSubscription("app", { error: null }, form({ subscribed: "on", updates: "on" }))).error).toBeTruthy();
  });
});
describe("manager authorization and bug privacy", () => {
  it("rejects a non-manager posting news or changing manager settings", async () => {
    expect((await publishUpdate("app", { error: null }, form({ title: "새 기능", body: "업데이트 내용", kind: "UPDATE" }))).error).toBeTruthy();
    expect((await setManagementNotifications("app", { error: null }, form({ management: "on" }))).error).toBeTruthy();
    expect(mocks.db.projectUpdate.create).not.toHaveBeenCalled();
    expect(mocks.db.projectMember.upsert).not.toHaveBeenCalled();
  });
  it("queues news only for matching opt-ins, excluding the author", async () => {
    mocks.access.mockResolvedValue({ project: { id: "project", status: "PUBLISHED" }, manager: true });
    mocks.db.projectUpdate.create.mockResolvedValue({ id: "post", kind: "RECRUITMENT" });
    mocks.db.projectFollow.findMany.mockResolvedValue([{ userId: "subscriber" }, { userId: "viewer" }]);
    const result = await publishUpdate("app", { error: null }, form({ title: "테스터 모집", body: "테스터를 모집합니다.", kind: "RECRUITMENT" }));
    expect(result.error).toBeNull();
    expect(mocks.db.projectFollow.findMany.mock.calls[0]![0].where).toEqual({ projectId: "project", notifyRecruitment: true });
    expect(mocks.db.mattermostDelivery.createMany.mock.calls[0]![0].data).toHaveLength(1);
  });
  it("stores a private bug and does not include its body in notifications", async () => {
    mocks.db.bugReport.create.mockResolvedValue({ id: "bug" });
    mocks.db.projectMember.findMany.mockResolvedValue([{ userId: "owner", notifyManagement: false }]);
    const result = await submitBug("app", { error: null }, form({ title: "로그인 오류", description: "로그인 버튼을 누르면 오류가 발생합니다." }));
    expect(result.error).toBeNull();
    expect(mocks.db.bugReport.create.mock.calls[0]![0].data.notifyStatus).toBe(false);
    expect(JSON.stringify(mocks.db.notification.createMany.mock.calls)).not.toContain("로그인 버튼");
    expect(mocks.db.mattermostDelivery.createMany).not.toHaveBeenCalled();
  });
  it("blocks non-managers modifying bug status", async () => {
    mocks.db.bugReport.findUnique.mockResolvedValue({ id: "bug", project: { slug: "app" } });
    expect((await updateBug("bug", { error: null }, form({ status: "FIXED", resolution: "" }))).error).toBeTruthy();
    expect(mocks.db.bugReport.updateMany).not.toHaveBeenCalled();
  });
  it("restricts bug subscription changes to the reporter", async () => {
    mocks.db.bugReport.updateMany.mockResolvedValue({ count: 0 });
    expect((await setBugNotifications("other-bug", { error: null }, form({}))).error).toBeTruthy();
    expect(mocks.db.bugReport.updateMany.mock.calls[0]![0].where).toEqual({ id: "other-bug", reporterId: "viewer" });
  });
});
describe("policy", () => {
  it("grants manager access only to owner and maintainers", () => {
    expect(canManage("owner", "owner")).toBe(true);
    expect(canManage("owner", "user", "MAINTAINER")).toBe(true);
    expect(canManage("owner", "user", "CONTRIBUTOR")).toBe(false);
    expect(canManage("owner", "user")).toBe(false);
  });
  it("does not revive past events after re-enabling notifications", () => {
    expect(consentAllows(true, new Date(200), new Date(100))).toBe(false);
    expect(consentAllows(false, new Date(0), new Date(100))).toBe(false);
    expect(consentAllows(true, new Date(0), new Date(100))).toBe(true);
  });
});

