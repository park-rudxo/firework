"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireNamedViewer, requireViewer } from "@/lib/session";
import { notify, notifyMany } from "@/features/notification/create";
import { enqueueOutbound } from "@/features/notification/dispatch";
import { deliverPending } from "@/features/mattermost/deliver";
import { getProjectAccess, managerUserIds } from "@/features/project/permissions";
import {
  BUG_STATUS_LABEL,
  bugReportInputFromFormData,
  bugReportInputSchema,
  bugStatusSchema,
} from "@/features/bug/schema";

export type BugState = { ok: boolean; message: string | null; fieldErrors?: Record<string, string[]> };

/**
 * 버그 제보.
 *
 * 신고(Report)와 큐를 섞지 않는다. 신고는 관리자가 숨김·삭제를 판단하는 일이고,
 * 제보는 제작자가 고치는 일이다. 받는 사람도 결말도 다르다.
 *
 * 닉네임 게이트를 두는 이유는 제보 자체를 막으려는 게 아니라, 계정을 여러 개 만들어
 * 같은 제보를 반복해 남의 프로젝트를 덮는 것을 억제하기 위해서다.
 */
export async function submitBugReport(
  slug: string,
  _prev: BugState,
  form: FormData,
): Promise<BugState> {
  const viewer = await requireNamedViewer();

  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, name: true, ownerId: true, status: true },
  });
  if (!project) return { ok: false, message: "프로젝트를 찾을 수 없습니다." };
  if (project.status !== "PUBLISHED") {
    return { ok: false, message: "공개된 프로젝트에만 제보할 수 있습니다." };
  }

  const parsed = bugReportInputSchema.safeParse(bugReportInputFromFormData(form));
  if (!parsed.success) {
    return {
      ok: false,
      message: "입력을 확인해주세요.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;

  // 같은 사람이 같은 프로젝트에 처리 대기 중인 제보를 무한히 쌓지 못하게 막는다.
  const pendingMine = await db.bugReport.count({
    where: { projectId: project.id, reporterId: viewer.id, status: { in: ["RECEIVED", "TRIAGING"] } },
  });
  if (pendingMine >= 10) {
    return { ok: false, message: "처리 대기 중인 제보가 많습니다. 기존 제보의 진행을 먼저 확인해주세요." };
  }

  await db.bugReport.create({
    data: {
      projectId: project.id,
      reporterId: viewer.id,
      title: input.title,
      detail: input.detail,
      environment: input.environment ?? null,
      notifyReporter: input.notifyReporter,
    },
  });

  // 관리 팀에게 알린다. 등록자 한 명이 아니라 팀 전원이다 —
  // 한 사람 받은 편지함에만 쌓이면 그 사람이 바쁠 때 제보가 멈춘다.
  const managers = (await managerUserIds(project.id)).filter((id) => id !== viewer.id);
  const url = `/dashboard/projects/${slug}/bugs`;

  await notifyMany(managers, {
    type: "BUG_REPORT_FILED",
    title: `${project.name} 에 버그 제보가 들어왔습니다`,
    // 본문은 넣지 않는다. 알림 목록은 사이트 안이지만, 이 알림은 Mattermost 로도
    // 나가고 채팅 미리보기에는 권한 개념이 없다.
    body: input.title,
    url,
  });

  // 제보는 관리 팀에게 긴급도가 높다. 프로젝트 구독과 무관하게,
  // 관리자 본인이 Mattermost 수신을 켜뒀을 때만 나간다.
  await enqueueOutbound(managers, {
    projectId: project.id,
    title: `${project.name} · 새 버그 제보`,
    body: input.title,
    url,
  });
  void deliverPending().catch(() => {});

  revalidatePath(`/projects/${slug}`);
  revalidatePath(url);
  return { ok: true, message: "제보를 보냈습니다. 처리 상황은 프로젝트 페이지에서 확인할 수 있습니다." };
}

const statusInput = z.object({
  reportId: z.string().min(1),
  status: bugStatusSchema,
  statusNote: z.string().trim().max(1000).optional(),
});

/**
 * 처리 상태 변경. 프로젝트 관리 팀만 할 수 있다.
 *
 * 제보자에게 알림이 가는 것은 **제보자가 켜뒀을 때만** 이다. 제보했다는 사실이
 * 알림 동의가 되지는 않는다.
 */
export async function updateBugStatus(
  slug: string,
  _prev: BugState,
  form: FormData,
): Promise<BugState> {
  const viewer = await requireViewer();

  const parsed = statusInput.safeParse({
    reportId: form.get("reportId"),
    status: form.get("status"),
    statusNote: String(form.get("statusNote") ?? "") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "입력을 확인해주세요." };

  const report = await db.bugReport.findUnique({
    where: { id: parsed.data.reportId },
    select: {
      id: true,
      status: true,
      title: true,
      notifyReporter: true,
      reporterId: true,
      project: { select: { id: true, slug: true, name: true, ownerId: true } },
    },
  });
  if (!report || report.project.slug !== slug) {
    return { ok: false, message: "제보를 찾을 수 없습니다." };
  }

  const access = await getProjectAccess(report.project, viewer.id);
  if (!access.canManage) return { ok: false, message: "이 프로젝트의 관리 팀만 바꿀 수 있습니다." };

  if (report.status === parsed.data.status && !parsed.data.statusNote) {
    return { ok: true, message: null };
  }

  await db.bugReport.update({
    where: { id: report.id },
    data: {
      status: parsed.data.status,
      statusNote: parsed.data.statusNote ?? null,
      handledById: viewer.id,
      handledAt: new Date(),
    },
  });

  if (report.notifyReporter && report.reporterId !== viewer.id) {
    const url = `/projects/${slug}#bug-${report.id}`;
    const title = `제보하신 버그가 "${BUG_STATUS_LABEL[parsed.data.status]}" 로 바뀌었습니다`;

    await notify({
      userId: report.reporterId,
      type: "BUG_REPORT_STATUS_CHANGED",
      title,
      body: report.title,
      url,
    });
    await enqueueOutbound([report.reporterId], {
      projectId: report.project.id,
      title: `${report.project.name} · ${BUG_STATUS_LABEL[parsed.data.status]}`,
      body: report.title,
      url,
    });
    void deliverPending().catch(() => {});
  }

  revalidatePath(`/dashboard/projects/${slug}/bugs`);
  revalidatePath(`/projects/${slug}`);
  return { ok: true, message: "처리 상태를 바꿨습니다." };
}

/** 제보자가 자기 제보의 알림 수신을 켜고 끈다. */
export async function setBugNotify(reportId: string, enabled: boolean): Promise<BugState> {
  const viewer = await requireViewer();

  const updated = await db.bugReport.updateMany({
    where: { id: reportId, reporterId: viewer.id },
    data: { notifyReporter: enabled },
  });
  if (updated.count === 0) return { ok: false, message: "제보를 찾을 수 없습니다." };

  const report = await db.bugReport.findUnique({
    where: { id: reportId },
    select: { project: { select: { slug: true } } },
  });
  if (report) revalidatePath(`/projects/${report.project.slug}`);

  return { ok: true, message: enabled ? "처리 알림을 켰습니다." : "처리 알림을 껐습니다." };
}
