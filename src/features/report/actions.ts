"use server";

import { z } from "zod";
import { Prisma, type ReportReason, type ReportTargetType } from "@prisma/client";

import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";
import { REASON_SEVERITY } from "@/features/report/policy";

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
