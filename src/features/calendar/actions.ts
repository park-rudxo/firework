"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";

export type EventState = { error: string | null };

const eventSchema = z
  .object({
    // SURVEY·RAFFLE 은 설문·추첨을 만들 때 자동으로 생기므로 손으로 만들지 않는다.
    type: z.enum(["TEST", "UPDATE", "RELEASE", "MILESTONE", "OTHER"]),
    title: z.string().trim().min(2, "제목을 입력해주세요.").max(100),
    description: z.string().trim().max(1000).optional(),
    startsAt: z.string().min(1, "시작일을 정해주세요."),
    endsAt: z.string().optional(),
    allDay: z.boolean().default(true),
    url: z
      .union([z.url(), z.literal("")])
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .transform((v) => ({
    ...v,
    startsAt: new Date(v.startsAt),
    endsAt: v.endsAt ? new Date(v.endsAt) : null,
  }))
  .refine((v) => !Number.isNaN(v.startsAt.getTime()), { message: "시작일이 올바르지 않습니다." })
  .refine((v) => v.endsAt === null || !Number.isNaN(v.endsAt.getTime()), {
    message: "종료일이 올바르지 않습니다.",
  })
  .refine((v) => v.endsAt === null || v.endsAt >= v.startsAt, {
    message: "종료일은 시작일보다 뒤여야 합니다.",
  });

export async function createEvent(
  slug: string,
  _prev: EventState,
  form: FormData,
): Promise<EventState> {
  const viewer = await requireViewer();

  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, ownerId: true },
  });
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };
  if (project.ownerId !== viewer.id) return { error: "본인의 프로젝트만 일정을 등록할 수 있습니다." };

  const parsed = eventSchema.safeParse({
    type: form.get("type"),
    title: form.get("title"),
    description: String(form.get("description") ?? "") || undefined,
    startsAt: String(form.get("startsAt") ?? ""),
    endsAt: String(form.get("endsAt") ?? "") || undefined,
    allDay: form.get("allDay") !== null,
    url: String(form.get("url") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력을 확인해주세요." };
  }

  await db.projectEvent.create({
    data: {
      projectId: project.id,
      type: parsed.data.type,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      allDay: parsed.data.allDay,
      url: parsed.data.url,
      createdById: viewer.id,
    },
  });

  revalidatePath(`/projects/${slug}`);
  revalidatePath("/calendar");
  return { error: null };
}

export async function deleteEvent(eventId: string): Promise<EventState> {
  const viewer = await requireViewer();

  const event = await db.projectEvent.findUnique({
    where: { id: eventId },
    select: {
      autoSourceType: true,
      project: { select: { ownerId: true, slug: true } },
    },
  });
  if (!event) return { error: "일정을 찾을 수 없습니다." };
  if (event.project.ownerId !== viewer.id) return { error: "권한이 없습니다." };

  // 설문·추첨에서 자동 생성된 일정은 원본을 닫아야 사라진다.
  // 여기서 지우게 두면 일정만 없고 설문은 열려 있는 어긋난 상태가 된다.
  if (event.autoSourceType) {
    return { error: "설문·추첨 일정은 해당 설문이나 추첨에서 관리해주세요." };
  }

  await db.projectEvent.delete({ where: { id: eventId } });

  revalidatePath(`/projects/${event.project.slug}`);
  revalidatePath("/calendar");
  return { error: null };
}
