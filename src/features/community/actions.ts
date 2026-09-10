"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";
import { projectAccess, CommunityError } from "./access";
import { mattermostDeliveryConfigured } from "@/features/mattermost/config";

export type CommunityState = { error: string | null; success?: string };
const textInput = z.string().trim().min(2).max(120);
const bugInput = z.object({ title: textInput, description: z.string().trim().min(10).max(5000) });
const updateInput = z.object({ title: textInput, body: z.string().trim().min(2).max(5000), kind: z.enum(["UPDATE", "RECRUITMENT"]) });
const checkbox = (form: FormData, key: string) => form.get(key) === "on";
function refresh(slug: string) {
  revalidatePath("/subscriptions");
  revalidatePath("/bugs");
  revalidatePath(`/projects/${slug}`);
  revalidatePath(`/projects/${slug}/community`);
  revalidatePath(`/dashboard/projects/${slug}/community`);
}
function failure(error: unknown): CommunityState {
  return { error: error instanceof CommunityError ? error.message : "저장하지 못했습니다. 로그인 상태를 확인하고 다시 시도해주세요." };
}
async function requireDelivery(userId: string) {
  if (!mattermostDeliveryConfigured()) throw new CommunityError("Mattermost 알림 연결이 아직 준비되지 않았습니다.");
  if (!await db.mattermostIdentity.findUnique({ where: { userId } }))
    throw new CommunityError("프로필 설정에서 Mattermost 계정을 먼저 인증해주세요.");
}
export async function setSubscription(slug: string, _state: CommunityState, form: FormData): Promise<CommunityState> {
  try {
    const viewer = await requireViewer();
    const { project } = await projectAccess(slug, viewer.id);
    const subscribe = checkbox(form, "subscribed");
    const updates = subscribe && checkbox(form, "updates");
    const recruitment = subscribe && checkbox(form, "recruitment");
    if (subscribe && project.status !== "PUBLISHED") throw new CommunityError("공개 프로젝트만 구독할 수 있습니다.");
    if (updates || recruitment) await requireDelivery(viewer.id);
    await db.$transaction(async tx => {
      // Cancel all queued items so opt-out followed by opt-in never revives old messages.
      await tx.mattermostDelivery.updateMany({
        where: { userId: viewer.id, projectId: project.id, kind: { in: ["UPDATE", "RECRUITMENT"] }, status: { in: ["PENDING", "SENDING"] } },
        data: { status: "CANCELLED" },
      });
      const where = { projectId_userId: { projectId: project.id, userId: viewer.id } };
      if (!subscribe) await tx.projectFollow.deleteMany({ where: { projectId: project.id, userId: viewer.id } });
      else await tx.projectFollow.upsert({
        where,
        create: { projectId: project.id, userId: viewer.id, notifyUpdates: updates, notifyRecruitment: recruitment },
        update: { notifyUpdates: updates, notifyRecruitment: recruitment, notificationChangedAt: new Date() },
      });
    });
    refresh(slug);
    return { error: null, success: subscribe ? "구독과 알림 설정을 저장했습니다." : "구독을 해제하고 알림을 껐습니다." };
  } catch (error) { return failure(error); }
}
export async function setManagementNotifications(slug: string, _state: CommunityState, form: FormData): Promise<CommunityState> {
  try {
    const viewer = await requireViewer();
    const { project, manager } = await projectAccess(slug, viewer.id);
    if (!manager) throw new CommunityError("관리 권한이 없습니다.");
    const enabled = checkbox(form, "management");
    if (enabled) await requireDelivery(viewer.id);
    await db.$transaction(async tx => {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: viewer.id } },
        create: { projectId: project.id, userId: viewer.id, role: "OWNER", notifyManagement: enabled },
        update: { notifyManagement: enabled, notificationChangedAt: new Date() },
      });
      await tx.mattermostDelivery.updateMany({
        where: { userId: viewer.id, projectId: project.id, kind: "MANAGEMENT", status: { in: ["PENDING", "SENDING"] } },
        data: { status: "CANCELLED" },
      });
    });
    refresh(slug);
    return { error: null, success: "관리 알림 설정을 저장했습니다." };
  } catch (error) { return failure(error); }
}
export async function publishUpdate(slug: string, _state: CommunityState, form: FormData): Promise<CommunityState> {
  try {
    const viewer = await requireViewer();
    const { project, manager } = await projectAccess(slug, viewer.id);
    if (!manager) throw new CommunityError("관리 권한이 없습니다.");
    if (project.status !== "PUBLISHED") throw new CommunityError("공개 후 소식을 게시해주세요.");
    const parsed = updateInput.safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new CommunityError("제목(2~120자)과 본문(2~5,000자)을 확인해주세요.");
    await db.$transaction(async tx => {
      const post = await tx.projectUpdate.create({ data: { ...parsed.data, projectId: project.id, authorId: viewer.id } });
      const followers = await tx.projectFollow.findMany({
        where: { projectId: project.id, ...(post.kind === "UPDATE" ? { notifyUpdates: true } : { notifyRecruitment: true }) },
        select: { userId: true },
      });
      if (followers.length) await tx.mattermostDelivery.createMany({
        data: followers.filter(f => f.userId !== viewer.id).map(f => ({
          userId: f.userId, projectId: project.id, kind: post.kind, sourceId: post.id,
          dedupeKey: `update:${post.id}:${f.userId}`,
        })),
      });
    });
    refresh(slug);
    return { error: null, success: "소식을 게시했습니다. 알림을 동의한 구독자만 발송 대상이 됩니다." };
  } catch (error) { return failure(error); }
}
export async function submitBug(slug: string, _state: CommunityState, form: FormData): Promise<CommunityState> {
  try {
    const viewer = await requireViewer();
    const { project } = await projectAccess(slug, viewer.id);
    if (project.status !== "PUBLISHED") throw new CommunityError("공개 프로젝트에만 제보할 수 있습니다.");
    const parsed = bugInput.safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new CommunityError("제목(2~120자), 재현 방법(10~5,000자)을 확인해주세요.");
    const notifyStatus = checkbox(form, "notifyStatus");
    if (notifyStatus) await requireDelivery(viewer.id);
    await db.$transaction(async tx => {
      const bug = await tx.bugReport.create({ data: { ...parsed.data, projectId: project.id, reporterId: viewer.id, notifyStatus } });
      const members = await tx.projectMember.findMany({ where: { projectId: project.id, role: { in: ["OWNER", "MAINTAINER"] } } });
      const managers = [...new Set([project.ownerId, ...members.map(m => m.userId)])].filter(id => id !== viewer.id);
      await tx.notification.createMany({ data: managers.map(userId => ({
        userId, type: "BUG_REPORTED" as const, title: "새 버그 신고가 접수되었습니다.",
        url: `/dashboard/projects/${encodeURIComponent(slug)}/community`,
      })) });
      const recipients = members.filter(m => m.notifyManagement && m.userId !== viewer.id);
      if (recipients.length) await tx.mattermostDelivery.createMany({ data: recipients.map(m => ({
        userId: m.userId, projectId: project.id, kind: "MANAGEMENT" as const,
        sourceId: bug.id, dedupeKey: `bug:${bug.id}:${m.userId}`,
      })) });
    });
    refresh(slug);
    return { error: null, success: "버그를 제보했습니다. ‘내 버그 신고’에서 처리 상황을 확인할 수 있습니다." };
  } catch (error) { return failure(error); }
}
export async function updateBug(bugId: string, _state: CommunityState, form: FormData): Promise<CommunityState> {
  try {
    const viewer = await requireViewer();
    const bug = await db.bugReport.findUnique({ where: { id: bugId }, include: { project: { select: { slug: true } } } });
    if (!bug) throw new CommunityError("신고를 찾을 수 없습니다.");
    const { manager } = await projectAccess(bug.project.slug, viewer.id);
    if (!manager) throw new CommunityError("관리 권한이 없습니다.");
    const parsed = z.object({ status: z.enum(["OPEN", "INVESTIGATING", "FIXED"]), resolution: z.string().trim().max(5000) }).safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new CommunityError("처리 상태와 답변을 확인해주세요.");
    await db.$transaction(async tx => {
      // Optimistic concurrency: do not silently overwrite another manager's work.
      const changed = await tx.bugReport.updateMany({ where: { id: bugId, updatedAt: bug.updatedAt }, data: parsed.data });
      if (!changed.count) throw new CommunityError("다른 팀원이 변경했습니다. 새로고침 후 다시 시도해주세요.");
      if (bug.status !== parsed.data.status && bug.reporterId !== viewer.id) {
        await tx.notification.create({ data: {
          userId: bug.reporterId, type: "BUG_STATUS_CHANGED", title: "신고한 버그의 처리 상태가 변경되었습니다.", url: "/bugs",
        } });
        if (bug.notifyStatus) await tx.mattermostDelivery.create({ data: {
          userId: bug.reporterId, projectId: bug.projectId, kind: "BUG_STATUS", sourceId: bug.id,
          dedupeKey: `bug-status:${bug.id}:${randomUUID()}`,
        } });
      }
    });
    refresh(bug.project.slug);
    return { error: null, success: "처리 상태를 저장했습니다." };
  } catch (error) { return failure(error); }
}
export async function setBugNotifications(bugId: string, _state: CommunityState, form: FormData): Promise<CommunityState> {
  try {
    const viewer = await requireViewer();
    const enabled = checkbox(form, "notifyStatus");
    if (enabled) await requireDelivery(viewer.id);
    await db.$transaction(async tx => {
      const result = await tx.bugReport.updateMany({
        where: { id: bugId, reporterId: viewer.id },
        data: { notifyStatus: enabled, notificationChangedAt: new Date() },
      });
      if (!result.count) throw new CommunityError("본인의 신고만 설정할 수 있습니다.");
      await tx.mattermostDelivery.updateMany({
        where: { userId: viewer.id, sourceId: bugId, kind: "BUG_STATUS", status: { in: ["PENDING", "SENDING"] } },
        data: { status: "CANCELLED" },
      });
    });
    revalidatePath("/bugs");
    return { error: null, success: "처리 알림 설정을 저장했습니다." };
  } catch (error) { return failure(error); }
}


