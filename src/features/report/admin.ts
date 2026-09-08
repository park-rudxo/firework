"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { notify } from "@/features/notification/create";

export type AdminState = { error: string | null };

const resolveSchema = z.object({
  reportId: z.string().min(1),
  action: z.enum(["HIDE", "REMOVE", "REJECT"]),
  note: z.string().trim().max(1000).optional(),
});

/**
 * 신고 처리. **여기가 프로젝트 상태를 바꾸는 유일한 곳이다.**
 *
 * 신고 접수만으로는 아무것도 내려가지 않는다. 자동 숨김을 두면 경쟁 프로젝트를
 * 신고 몇 번으로 죽일 수 있기 때문이다. 숨김·삭제는 사람이 확인하고 누른다.
 */
export async function resolveReport(_prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();

  const parsed = resolveSchema.safeParse({
    reportId: form.get("reportId"),
    action: form.get("action"),
    note: String(form.get("note") ?? "") || undefined,
  });
  if (!parsed.success) return { error: "처리 내용을 확인해주세요." };

  const report = await db.report.findUnique({
    where: { id: parsed.data.reportId },
    select: { id: true, targetType: true, targetId: true, status: true },
  });
  if (!report) return { error: "신고를 찾을 수 없습니다." };

  const { action, note } = parsed.data;

  if (action !== "REJECT" && report.targetType === "PROJECT") {
    const project = await db.project.update({
      where: { id: report.targetId },
      data: { status: action === "HIDE" ? "HIDDEN" : "REMOVED" },
      select: { ownerId: true, name: true, slug: true },
    });

    // 조치를 당한 사람이 이유를 모르면 이의를 제기할 수도 없다.
    await notify({
      userId: project.ownerId,
      type: "REPORT_RESOLVED",
      title: action === "HIDE" ? `${project.name} 이 숨김 처리되었습니다` : `${project.name} 이 삭제되었습니다`,
      body: note ?? "신고 검토 결과에 따른 조치입니다. 이의가 있다면 문의해주세요.",
      url: `/projects/${project.slug}/edit`,
    });
  }
  if (action !== "REJECT" && report.targetType === "PROJECT_EVENT") {
    await db.projectEvent.delete({ where: { id: report.targetId } }).catch(() => {});
  }

  await db.report.update({
    where: { id: report.id },
    data: {
      status: action === "REJECT" ? "REJECTED" : "ACTION_TAKEN",
      resolvedById: admin.id,
      resolvedAt: new Date(),
      resolutionNote: note ?? null,
    },
  });

  revalidatePath("/admin/reports");
  return { error: null };
}

/** 프로젝트를 다시 공개 가능한 상태로 되돌린다. 오판을 정정할 수 있어야 한다. */
export async function restoreProject(projectId: string): Promise<AdminState> {
  await requireAdmin();

  await db.project.update({
    where: { id: projectId },
    data: { status: "DRAFT" },
  });

  revalidatePath("/admin/reports");
  return { error: null };
}
