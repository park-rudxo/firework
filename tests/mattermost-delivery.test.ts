import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MattermostDelivery } from "@prisma/client";
const mock = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() });
  return { db: { mattermostIdentity: model(), project: model(), projectFollow: model(), projectUpdate: model(), projectMember: model(), bugReport: model(), mattermostDelivery: model() }, configured: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: mock.db }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ BETTER_AUTH_URL: "https://firework.example" }) }));
vi.mock("@/features/mattermost/config", () => ({ MATTERMOST_ORIGIN: "https://meeting.ssafy.com", mattermostDeliveryConfigured: mock.configured }));
import { deliveryTarget, deliverPending } from "@/features/mattermost/delivery";
const item = { id: "delivery", userId: "user", projectId: "project", kind: "UPDATE", sourceId: "post", dedupeKey: "key",
  status: "PENDING", attempts: 0, availableAt: new Date(10), leaseUntil: null, leaseToken: null,
  lastError: null, createdAt: new Date(100), sentAt: null } satisfies MattermostDelivery;
beforeEach(() => {
  vi.resetAllMocks();
  mock.configured.mockReturnValue(true);
  mock.db.mattermostIdentity.findUnique.mockResolvedValue({ mattermostUserId: "mm", verifiedAt: new Date(0) });
  mock.db.project.findUnique.mockResolvedValue({ id: "project", slug: "테스트", ownerId: "owner", status: "PUBLISHED" });
  mock.db.projectFollow.findUnique.mockResolvedValue({ notifyUpdates: true, notifyRecruitment: false, notificationChangedAt: new Date(0) });
  mock.db.projectUpdate.findUnique.mockResolvedValue({ id: "post", projectId: "project", kind: "UPDATE", title: "@channel malicious" });
});
describe("delivery consent enforcement", () => {
  it("uses a fixed message with no user supplied mentions or private content", async () => {
    const target = await deliveryTarget(item);
    expect(target?.message).toContain(encodeURIComponent("테스트"));
    expect(target?.message).not.toContain("@channel");
  });
  it("suppresses notifications after opt-out", async () => {
    mock.db.projectFollow.findUnique.mockResolvedValue({ notifyUpdates: false, notificationChangedAt: new Date(0) });
    expect(await deliveryTarget(item)).toBeNull();
  });
  it("suppresses notifications after unsubscribe and resubscribe", async () => {
    mock.db.projectFollow.findUnique.mockResolvedValue({ notifyUpdates: true, notificationChangedAt: new Date(200) });
    expect(await deliveryTarget(item)).toBeNull();
  });
  it("suppresses a hidden project, missing identity, or mismatched source", async () => {
    mock.db.project.findUnique.mockResolvedValueOnce({ status: "HIDDEN" });
    expect(await deliveryTarget(item)).toBeNull();
    mock.db.mattermostIdentity.findUnique.mockResolvedValueOnce(null);
    expect(await deliveryTarget(item)).toBeNull();
    mock.db.projectUpdate.findUnique.mockResolvedValueOnce({ projectId: "other", kind: "UPDATE" });
    expect(await deliveryTarget(item)).toBeNull();
  });
  it("rechecks manager privileges", async () => {
    mock.db.bugReport.findUnique.mockResolvedValue({ projectId: "project" });
    mock.db.projectMember.findUnique.mockResolvedValue({ role: "CONTRIBUTOR", notifyManagement: true, notificationChangedAt: new Date(0) });
    expect(await deliveryTarget({ ...item, kind: "MANAGEMENT" })).toBeNull();
  });
  it("does not perform network calls when delivery is unconfigured", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    mock.configured.mockReturnValue(false);
    expect(await deliverPending()).toEqual({ configured: false, sent: 0 });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("cancels a queued item without making a network request when consent was revoked", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    mock.db.mattermostDelivery.findMany.mockResolvedValue([item]);
    mock.db.mattermostDelivery.updateMany.mockResolvedValue({ count: 1 });
    mock.db.projectFollow.findUnique.mockResolvedValue(null);
    await deliverPending();
    expect(fetch).not.toHaveBeenCalled();
    expect(mock.db.mattermostDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) }));
    vi.unstubAllGlobals();
  });
});

