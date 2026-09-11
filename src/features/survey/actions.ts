"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireNamedViewer, requireViewer } from "@/lib/session";
import { bumpStat } from "@/features/curation/stats";
import { notify } from "@/features/notification/create";
import { canManageProject, isProjectTeamMember } from "@/features/community/access";
import { batchToOpen, MIN_RESPONSES_TO_REVEAL } from "@/features/survey/anonymity";
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
 *   survey_response       내용만.  userId 도, 시간 정보도 없음.
 *   survey_participation  누구인지만.  내용 없음.
 *
 * 그래서 제작자 화면 어디에도 "이 사람이 이 응답을 썼다"를 뽑아낼 조회가 없다.
 * 응모권(raffle_entry)도 participation 쪽에만 붙는다.
 *
 * 단, 응답자가 한 명뿐이면 두 표를 나란히 놓기만 해도 대응이 보인다. 표본이 작을 때
 * 익명성을 깨는 것은 구조가 아니라 표본 크기이고, 그것까지 스키마로 막을 수는 없다.
 * 그 부분은 화면에서 3건 묶음 공개로 눌러둔다(features/survey/anonymity.ts).
 */
export async function submitSurveyResponse(
  surveyId: string,
  _prev: SurveyState,
  form: FormData,
): Promise<SurveyState> {
  // 응답 하나가 추첨 응모권 하나다. 계정을 여러 개 만들면 그대로 이득이 되므로
  // 닉네임을 형식대로 정한 사람만 받는다.
  let viewer;
  try {
    viewer = await requireNamedViewer();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "로그인이 필요합니다.",
    };
  }

  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      isOpen: true,
      opensAt: true,
      closesAt: true,
      questions: true,
      title: true,
      project: { select: { id: true, slug: true, status: true, ownerId: true, name: true } },
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
  // 등록자뿐 아니라 팀원 전원이다 — 등록자만 막으면 나머지 팀원이 응모권을 나눠 가지면 그만이다.
  if (await isProjectTeamMember(survey.project, viewer.id)) {
    return { ok: false, error: "본인 팀 프로젝트의 설문에는 응답할 수 없습니다." };
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

  let openedFirstBatch = false;
  try {
    openedFirstBatch = await db.$transaction(async (tx) => {
      // 0) 이 설문에 대한 제출을 한 줄로 세운다.
      //
      //    트랜잭션만으로는 부족하다. 기존 2건인 설문에 두 사람이 동시에 내면 각
      //    트랜잭션이 자기 응답을 넣고 각자 "3건이 됐다" 고 보아 둘 다 묶음을 연다.
      //    최종 4건이 공개되어, 두 사람 각각 나머지 한 건이 상대의 것임을 안다.
      //
      //    설문 부모 행을 잠가 같은 설문의 제출을 직렬화한다. 다른 설문끼리는 서로
      //    막지 않는다. 값은 Prisma 파라미터로 바인딩한다.
      await tx.$queryRaw`SELECT id FROM "Survey" WHERE id = ${surveyId} FOR UPDATE`;

      // 1) "누가 응답했다"는 사실. 중복 응답은 여기 UNIQUE 에서 걸린다.
      await tx.surveyParticipation.create({
        data: { surveyId, userId: viewer.id },
      });

      // 2) 응답 내용. userId 를 넣을 자리도, 언제 썼는지 남길 자리도 없다.
      //    날짜만 남겨도 하루 응답이 한 건인 날에는 위 참여 기록과 1:1 로 붙는다.
      //    revealed 는 false 로 들어간다 — 아래에서 묶음이 찼을 때만 열린다.
      await tx.surveyResponse.create({
        data: { surveyId, answers: parsed.data as Prisma.InputJsonValue },
      });

      // 3) 묶음이 찼으면 감춰둔 것을 연다.
      //
      //    **전체 건수가 아니라 아직 공개되지 않은 건수로 센다.** 예전에 5건이 모두
      //    공개돼 있던 설문은 전체가 3의 배수가 아니다. 전체로 세면 그런 설문에서는
      //    영영 열리지 않거나 엉뚱한 시점에 열린다.
      //
      //    공개 여부를 조회 시점에 계산하지 않고 여기서 행에 박아두는 이유:
      //    "앞에서 3건" 을 매번 다시 고르면, 새 응답이 정렬 순서상 앞에 끼어들 때
      //    이미 공개됐던 것이 사라지고 새 것이 나타난다. 그 차이 자체가 신규 응답을
      //    가리킨다. 한 번 켜진 것은 꺼지지 않아야 묶음의 구성원이 고정된다.
      const revealedBefore = await tx.surveyResponse.count({
        where: { surveyId, revealed: true },
      });
      const hidden = await tx.surveyResponse.findMany({
        where: { surveyId, revealed: false },
        orderBy: { id: "asc" },
        select: { id: true },
      });

      const toOpen = batchToOpen(hidden.length);
      if (toOpen > 0) {
        await tx.surveyResponse.updateMany({
          where: { id: { in: hidden.slice(0, toOpen).map((r) => r.id) } },
          data: { revealed: true },
        });
      }

      // 4) 응모권도 participation 쪽에만 붙는다. 응답 내용과는 연결되지 않는다.
      if (openRaffle) {
        await tx.raffleEntry.create({
          data: {
            raffleId: openRaffle.id,
            userId: viewer.id,
            ticketCode: randomBytes(8).toString("hex"),
          },
        });
      }

      // 알림 여부를 여기서 정해 돌려준다. 트랜잭션 밖에서 다시 세면 그사이 들어온
      // 응답 때문에 두 번 알리거나 아예 놓친다.
      return revealedBefore === 0 && toOpen > 0;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "이미 응답하신 설문입니다." };
    }
    throw err;
  }

  // 응답 행에 시간이 없으므로 기간별 집계는 이 카운터로만 낸다.
  // 개인과 연결되지 않는 합계라서 익명성을 해치지 않는다.
  await bumpStat(survey.project.id, "surveyResponses");

  // **응답이 올 때마다 제작자에게 알리지 않는다.** 그렇게 하면 제작자가 응답이
  // 도착한 시각을 알게 되고, 응답 행에서 시간을 지워둔 의미가 그 알림 하나로
  // 되살아난다("방금 A한테 부탁했는데 5분 뒤 알림이 왔다").
  // 첫 묶음이 열려 개별 응답을 볼 수 있게 된 순간에만 한 번 알린다.
  //
  // 판단은 위 트랜잭션이 커밋한 전환에서 이미 내렸다. 여기서 다시 세면 그사이 들어온
  // 응답 때문에 두 번 알리거나(동시 제출) 아예 놓친다(한 트랜잭션이 두 건을 열 때).
  if (openedFirstBatch) {
    await notify({
      userId: survey.project.ownerId,
      type: "SURVEY_THRESHOLD_REACHED",
      title: "이제 개별 피드백을 볼 수 있습니다",
      body: `${survey.project.name} — 응답이 ${MIN_RESPONSES_TO_REVEAL}건 모였습니다.`,
      url: `/dashboard/projects/${survey.project.slug}/feedback`,
    });
  }

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
  if (!(await canManageProject(project, viewer.id))) {
    return { error: "이 프로젝트의 관리 팀만 설문을 만들 수 있습니다." };
  }

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
      description: "응답하면 작성자 정보 없이 전달됩니다.",
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
    select: { id: true, project: { select: { id: true, ownerId: true, slug: true } } },
  });
  if (!survey) return { error: "설문을 찾을 수 없습니다." };
  if (!(await canManageProject(survey.project, viewer.id))) return { error: "권한이 없습니다." };

  await db.survey.update({ where: { id: surveyId }, data: { isOpen: false } });
  revalidatePath(`/projects/${survey.project.slug}`);
  return { error: null };
}
