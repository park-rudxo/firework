"use server";

import { z } from "zod";
import { Prisma, type ReportReason, type ReportTargetType } from "@prisma/client";

import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";
import { adminUserIds, notify, notifyMany } from "@/features/notification/create";
import { REASON_LABEL, REASON_SEVERITY, goesToAdminQueue } from "@/features/report/policy";

const schema = z.object({
  targetType: z.enum(["PROJECT", "PROJECT_EVENT", "SURVEY_RESPONSE", "USER"]),
  targetId: z.string().min(1),
  reason: z.enum([
    "MALWARE",
    "DATA_HARVESTING",
    "IMPERSONATION",
    "COMMERCIAL_SALE",
    "COPYRIGHT",
    "INAPPROPRIATE",
    "RAFFLE_FRAUD",
    "SPAM",
    "BROKEN_LINK",
    "OTHER",
  ]),
  detail: z.string().trim().max(2000).optional(),
});

export type ReportState = { ok: boolean; message: string | null };

export async function submitReport(_prev: ReportState, form: FormData): Promise<ReportState> {
  const viewer = await requireViewer();

  const parsed = schema.safeParse({
    targetType: form.get("targetType"),
    targetId: form.get("targetId"),
    reason: form.get("reason"),
    detail: String(form.get("detail") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: "신고 내용을 확인해주세요." };
  }

  const { targetType, targetId, reason, detail } = parsed.data;

  // 존재하지 않는 대상에 대한 신고로 큐를 채우지 못하게 막는다.
  if (!(await targetExists(targetType, targetId))) {
    return { ok: false, message: "신고 대상을 찾을 수 없습니다." };
  }

  try {
    await db.report.create({
      data: {
        targetType,
        targetId,
        reason,
        // 심각도는 사유에서 자동으로 정한다. 신고자가 고르게 두면 전부 CRITICAL 이 된다.
        severity: REASON_SEVERITY[reason as ReportReason],
        detail: detail ?? null,
        reporterId: viewer.id,
      },
    });
  } catch (err) {
    // (targetType, targetId, reporterId) UNIQUE — 같은 사람의 중복 신고
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, message: "이미 신고하신 대상입니다. 검토 중입니다." };
    }
    throw err;
  }

  // 신고가 접수돼도 대상의 상태는 바뀌지 않는다. 숨김·삭제는 관리자만 한다.
  // 알림은 "누가 봐야 하는가" 만 가른다.
  const severity = REASON_SEVERITY[reason as ReportReason];
  if (goesToAdminQueue(severity)) {
    await notifyMany(await adminUserIds(), {
      type: "REPORT_FILED",
      title: severity === "CRITICAL" ? `긴급 신고: ${REASON_LABEL[reason]}` : `신고 접수: ${REASON_LABEL[reason]}`,
      body: detail ?? undefined,
      url: "/admin/reports",
    });
  } else if (targetType === "PROJECT") {
    // BROKEN_LINK 는 제보성이라 관리자를 거치지 않고 제작자에게만 간다.
    const project = await db.project.findUnique({
      where: { id: targetId },
      select: { ownerId: true, slug: true, name: true },
    });
    if (project) {
      await notify({
        userId: project.ownerId,
        type: "BROKEN_LINK_REPORTED",
        title: "링크가 동작하지 않는다는 제보가 있습니다",
        body: `${project.name} — ${detail ?? "저장소나 데모 주소를 확인해주세요."}`,
        url: `/projects/${project.slug}/edit`,
      });
    }
  }

  return {
    ok: true,
    message:
      reason === "BROKEN_LINK"
        ? "제작자에게 전달했습니다. 고맙습니다."
        : "신고가 접수되었습니다. 관리자가 검토합니다.",
  };
}

async function targetExists(type: ReportTargetType, id: string): Promise<boolean> {
  switch (type) {
    case "PROJECT":
      return Boolean(await db.project.findUnique({ where: { id }, select: { id: true } }));
    case "PROJECT_EVENT":
      return Boolean(await db.projectEvent.findUnique({ where: { id }, select: { id: true } }));
    case "SURVEY_RESPONSE":
      return Boolean(await db.surveyResponse.findUnique({ where: { id }, select: { id: true } }));
    case "USER":
      return Boolean(await db.user.findUnique({ where: { id }, select: { id: true } }));
  }
}
