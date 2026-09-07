"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";
import { respondedOnToday } from "@/features/survey/anonymity";
import {
  answersFromFormData,
  buildAnswerSchema,
  questionSchema,
  surveyInputSchema,
  type Question,
} from "@/features/survey/schema";

export type SurveyState = { ok: boolean; error: string | null; enteredRaffle?: boolean };

/**
 * 설문 응답 제출.
 *
 * 익명성의 핵심이 여기 있다. 한 트랜잭션 안에서 두 레코드를 만들지만
 * 둘은 서로를 가리키지 않는다.
 *
 *   survey_response       내용만.  userId 없음. 시각이 아니라 날짜만.
 *   survey_participation  누구인지만.  내용 없음.
 *
 * 그래서 DB 를 통째로 들여다봐도 "이 사람이 이 응답을 썼다"를 복원할 수 없다.
 * 응모권(raffle_entry)도 participation 쪽에만 붙는다.
 */
export async function submitSurveyResponse(
  surveyId: string,
  _prev: SurveyState,
  form: FormData,
): Promise<SurveyState> {
  const viewer = await requireViewer();

  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      isOpen: true,
      opensAt: true,
      closesAt: true,
      questions: true,
      project: { select: { id: true, slug: true, status: true, ownerId: true } },
    },
  });

  if (!survey || survey.project.status !== "PUBLISHED") {
    return { ok: false, error: "설문을 찾을 수 없습니다." };
  }

  const now = new Date();
  if (!survey.isOpen || survey.opensAt > now || (survey.closesAt && survey.closesAt < now)) {
    return { ok: false, error: "마감된 설문입니다." };
  }

  // 제작자가 자기 설문에 응답해 추첨 응모권을 만드는 걸 막는다.
  if (survey.project.ownerId === viewer.id) {
    return { ok: false, error: "본인 프로젝트의 설문에는 응답할 수 없습니다." };
  }

  const questions = questionSchema.array().safeParse(survey.questions);
  if (!questions.success) {
    return { ok: false, error: "설문 문항이 손상되었습니다. 제작자에게 알려주세요." };
  }

  const parsed = buildAnswerSchema(questions.data).safeParse(
    answersFromFormData(questions.data, form),
  );
  if (!parsed.success) {
    return { ok: false, error: "필수 문항을 모두 채워주세요." };
  }

  const openRaffle = await db.raffle.findFirst({
    where: { surveyId, status: "OPEN", closesAt: { gte: now } },
    select: { id: true },
  });

  try {
    await db.$transaction(async (tx) => {
      // 1) "누가 응답했다"는 사실. 중복 응답은 여기 UNIQUE 에서 걸린다.
      await tx.surveyParticipation.create({
        data: { surveyId, userId: viewer.id },
      });

      // 2) 응답 내용. userId 를 넣을 자리가 아예 없고, 날짜만 남긴다.
      await tx.surveyResponse.create({
        data: {
          surveyId,
          answers: parsed.data as Prisma.InputJsonValue,
          respondedOn: respondedOnToday(),
        },
      });

      // 3) 응모권도 participation 쪽에만 붙는다. 응답 내용과는 연결되지 않는다.
      if (openRaffle) {
        await tx.raffleEntry.create({
          data: {
            raffleId: openRaffle.id,
            userId: viewer.id,
            ticketCode: randomBytes(8).toString("hex"),
          },
        });
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "이미 응답하신 설문입니다." };
    }
    throw err;
  }

  // 설문 응답은 SurveyResponse.respondedOn 으로 직접 세므로 별도 카운터가 필요 없다.
  revalidatePath(`/projects/${survey.project.slug}`);

  return { ok: true, error: null, enteredRaffle: Boolean(openRaffle) };
}

// ── 제작자용 설문 관리 ───────────────────────────────────────

export type SurveyAdminState = { error: string | null };

export async function createSurvey(
  slug: string,
  _prev: SurveyAdminState,
  form: FormData,
): Promise<SurveyAdminState> {
  const viewer = await requireViewer();

  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, ownerId: true },
  });
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };
  if (project.ownerId !== viewer.id) return { error: "본인의 프로젝트만 설문을 만들 수 있습니다." };

  let questions: Question[];
  try {
    questions = JSON.parse(String(form.get("questions") ?? "[]")) as Question[];
  } catch {
    return { error: "문항 형식이 올바르지 않습니다." };
  }

  const parsed = surveyInputSchema.safeParse({
    title: form.get("title"),
    description: String(form.get("description") ?? "") || undefined,
    questions,
    closesAt: String(form.get("closesAt") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력을 확인해주세요." };
  }

  const survey = await db.survey.create({
    data: {
      projectId: project.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      questions: parsed.data.questions as unknown as Prisma.InputJsonValue,
      closesAt: parsed.data.closesAt,
    },
  });

  // 설문 기간은 캘린더에도 자동으로 올라간다. 제작자가 따로 일정을 만들지 않아도 된다.
  await db.projectEvent.create({
    data: {
      projectId: project.id,
      type: "SURVEY",
      title: `설문: ${parsed.data.title}`,
      description: "응답하면 제작자에게 익명으로 전달됩니다.",
      startsAt: new Date(),
      endsAt: parsed.data.closesAt,
      allDay: true,
      url: `/projects/${slug}/survey`,
      createdById: viewer.id,
      autoSourceType: "survey",
      autoSourceId: survey.id,
    },
  });

  revalidatePath(`/projects/${slug}`);
  revalidatePath("/calendar");
  return { error: null };
}

export async function closeSurvey(surveyId: string): Promise<SurveyAdminState> {
  const viewer = await requireViewer();

  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: { id: true, project: { select: { ownerId: true, slug: true } } },
  });
  if (!survey) return { error: "설문을 찾을 수 없습니다." };
  if (survey.project.ownerId !== viewer.id) return { error: "권한이 없습니다." };

  await db.survey.update({ where: { id: surveyId }, data: { isOpen: false } });
  revalidatePath(`/projects/${survey.project.slug}`);
  return { error: null };
}
