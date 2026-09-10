"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";
import { deliverPending } from "@/features/mattermost/deliver";
import { notifySubscribers } from "@/features/notification/dispatch";
import { findManageableProject } from "@/features/project/permissions";
import { UPDATE_KIND_LABEL, projectUpdateInputFromFormData, projectUpdateInputSchema } from "@/features/update/schema";

export type UpdateState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Record<string, string[]>;
};

/**
 * 진행 소식 게시.
 *
 * 소식을 올리면 구독자의 사이트 알림에 뜬다. Mattermost 로 나가는 것은 그 프로젝트의
 * "업데이트·진행 소식" 알림을 직접 켠 사람뿐이다. 구독만 한 사람에게는 나가지 않는다.
 *
 * fixedBugReportIds 로 제보를 함께 닫을 수 있다. "제보가 실제 개선으로 이어졌다" 를
 * 화면에서 잇는 연결이고, 제보자에게는 그 사람이 켜둔 경우에만 알림이 간다.
 */
export async function postProjectUpdate(
  slug: string,
  _prev: UpdateState,
  form: FormData,
): Promise<UpdateState> {
  const viewer = await requireViewer();

  const project = await findManageableProject(slug, viewer.id);
  if (!project) return { ok: false, message: "이 프로젝트의 관리 팀만 소식을 올릴 수 있습니다." };

  const parsed = projectUpdateInputSchema.safeParse(projectUpdateInputFromFormData(form));
  if (!parsed.success) {
    return {
      ok: false,
      message: "입력을 확인해주세요.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;

  // 남의 프로젝트 제보 id 를 끼워 넣어도 닫히지 않도록, 이 프로젝트의 것만 남긴다.
  const fixable =
    input.fixedBugReportIds.length > 0
      ? await db.bugReport.findMany({
          where: { id: { in: input.fixedBugReportIds }, projectId: project.id },
          select: { id: true, reporterId: true, notifyReporter: true, title: true },
        })
      : [];

  const update = await db.projectUpdate.create({
    data: {
      projectId: project.id,
      authorId: viewer.id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      fixedBugReportIds: fixable.map((b) => b.id),
    },
    select: { id: true },
  });

  if (fixable.length > 0) {
    await db.bugReport.updateMany({
      where: { id: { in: fixable.map((b) => b.id) } },
      data: {
        status: "FIXED",
        statusNote: input.title,
        handledById: viewer.id,
        handledAt: new Date(),
      },
    });
  }

  const url = `/projects/${slug}#update-${update.id}`;

  if (input.notifySubscribers && project.status === "PUBLISHED") {
    await notifySubscribers({
      projectId: project.id,
      topic: "UPDATE",
      type: "PROJECT_UPDATE_POSTED",
      title: `${project.name} · ${UPDATE_KIND_LABEL[input.kind]}`,
      body: input.title,
      url,
      // 본인이 올린 소식을 본인에게 알리지 않는다.
      excludeUserIds: [viewer.id],
    });
    void deliverPending().catch(() => {});
  }

  revalidatePath(`/projects/${slug}`);
  revalidatePath(`/dashboard/projects/${slug}`);
  revalidatePath("/subscriptions");
  return { ok: true, message: "소식을 올렸습니다." };
}

/** 잘못 올린 소식을 지운다. 구독자에게 이미 나간 알림은 되돌리지 않는다. */
export async function deleteProjectUpdate(slug: string, updateId: string): Promise<UpdateState> {
  const viewer = await requireViewer();
  const project = await findManageableProject(slug, viewer.id);
  if (!project) return { ok: false, message: "권한이 없습니다." };

  await db.projectUpdate.deleteMany({ where: { id: updateId, projectId: project.id } });

  revalidatePath(`/projects/${slug}`);
  revalidatePath(`/dashboard/projects/${slug}`);
  return { ok: true, message: "소식을 지웠습니다." };
}
