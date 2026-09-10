import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { MattermostDelivery } from "@prisma/client";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { canManage, consentAllows } from "@/features/community/policy";
import { MATTERMOST_ORIGIN, mattermostDeliveryConfigured } from "./config";

export async function deliveryTarget(item: MattermostDelivery) {
  const [identity, project] = await Promise.all([
    db.mattermostIdentity.findUnique({ where: { userId: item.userId } }),
    db.project.findUnique({ where: { id: item.projectId } }),
  ]);
  if (!identity || identity.verifiedAt > item.createdAt || !project || project.status === "REMOVED") return null;
  const base = new URL(serverEnv().BETTER_AUTH_URL).origin;
  const slug = encodeURIComponent(project.slug);
  if (item.kind === "UPDATE" || item.kind === "RECRUITMENT") {
    if (project.status !== "PUBLISHED") return null;
    const [follow, post] = await Promise.all([
      db.projectFollow.findUnique({ where: { projectId_userId: { projectId: item.projectId, userId: item.userId } } }),
      db.projectUpdate.findUnique({ where: { id: item.sourceId } }),
    ]);
    if (!follow || !post || post.projectId !== item.projectId || post.kind !== item.kind) return null;
    const enabled = item.kind === "UPDATE" ? follow.notifyUpdates : follow.notifyRecruitment;
    if (!consentAllows(enabled, follow.notificationChangedAt, item.createdAt)) return null;
    // Do not let user-authored titles inject mentions or arbitrary links into outgoing messages.
    return { id: identity.mattermostUserId, message: `🔔 구독한 프로젝트에 새로운 ${item.kind === "UPDATE" ? "진행 소식" : "참여 모집"}이 있습니다.\n${base}/projects/${slug}/community\n알림 설정: ${base}/subscriptions` };
  }
  const bug = await db.bugReport.findUnique({ where: { id: item.sourceId } });
  if (!bug || bug.projectId !== item.projectId) return null;
  if (item.kind === "MANAGEMENT") {
    const member = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: item.projectId, userId: item.userId } } });
    if (!member || !canManage(project.ownerId, item.userId, member.role) ||
      !consentAllows(member.notifyManagement, member.notificationChangedAt, item.createdAt)) return null;
    return { id: identity.mattermostUserId, message: `🐛 관리 중인 프로젝트에 버그 신고가 접수되었습니다.\n${base}/dashboard/projects/${slug}/community\n위 페이지에서 관리 알림을 끌 수 있습니다.` };
  }
  if (bug.reporterId !== item.userId || !consentAllows(bug.notifyStatus, bug.notificationChangedAt, item.createdAt)) return null;
  return { id: identity.mattermostUserId, message: `✅ 신고한 버그의 처리 상태가 변경되었습니다.\n${base}/bugs\n위 페이지에서 처리 알림을 끌 수 있습니다.` };
}
async function botRequest(path: string, body: unknown) {
  const response = await fetch(MATTERMOST_ORIGIN + "/api/v4" + path, {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: "Bearer " + process.env.MATTERMOST_BOT_TOKEN!, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Mattermost HTTP " + response.status);
  return response.json() as Promise<{ id: string }>;
}
export async function deliverPending() {
  if (!mattermostDeliveryConfigured()) return { configured: false, sent: 0 };
  const now = new Date();
  await db.mattermostDelivery.updateMany({
    where: { status: "SENDING", attempts: { gte: 5 }, leaseUntil: { lt: now } },
    data: { status: "FAILED", leaseUntil: null, lastError: "Delivery retry limit reached" },
  });
  const due = await db.mattermostDelivery.findMany({
    where: { attempts: { lt: 5 }, OR: [
      { status: "PENDING", availableAt: { lte: now } },
      { status: "SENDING", leaseUntil: { lt: now } },
    ] }, orderBy: { createdAt: "asc" }, take: 10,
  });
  let sent = 0;
  for (const item of due) {
    const leaseToken = randomUUID();
    const claimed = await db.mattermostDelivery.updateMany({
      where: { id: item.id, attempts: item.attempts, status: item.status, ...(item.status === "SENDING" ? { leaseUntil: { lt: new Date() } } : {}) },
      data: { status: "SENDING", attempts: { increment: 1 }, leaseToken, leaseUntil: new Date(Date.now() + 60_000) },
    });
    if (!claimed.count) continue;
    try {
      const target = await deliveryTarget(item);
      if (!target) {
        await db.mattermostDelivery.updateMany({ where: { id: item.id, leaseToken, status: "SENDING" }, data: { status: "CANCELLED", leaseUntil: null } });
        continue;
      }
      const channel = await botRequest("/channels/direct", [process.env.MATTERMOST_BOT_USER_ID!, target.id]);
      if (!channel.id) throw new Error("Missing DM channel");
      // Recheck consent after network I/O, immediately before the irreversible post.
      const current = await db.mattermostDelivery.findUnique({ where: { id: item.id } });
      if (!current || current.status !== "SENDING" || current.leaseToken !== leaseToken || !await deliveryTarget(item)) {
        await db.mattermostDelivery.updateMany({ where: { id: item.id, leaseToken, status: "SENDING" }, data: { status: "CANCELLED", leaseUntil: null } });
        continue;
      }
      await botRequest("/posts", { channel_id: channel.id, message: target.message,
        pending_post_id: createHash("sha256").update(item.id).digest("hex").slice(0, 26) });
      await db.mattermostDelivery.updateMany({ where: { id: item.id, leaseToken, status: "SENDING" },
        data: { status: "SENT", sentAt: new Date(), leaseUntil: null, lastError: null } });
      sent++;
    } catch {
      await db.mattermostDelivery.updateMany({ where: { id: item.id, leaseToken, status: "SENDING" }, data: {
        status: item.attempts + 1 >= 5 ? "FAILED" : "PENDING", leaseUntil: null,
        availableAt: new Date(Date.now() + 60_000 * 2 ** item.attempts),
        lastError: "Mattermost delivery failed",
      } });
    }
  }
  return { configured: true, sent };
}
