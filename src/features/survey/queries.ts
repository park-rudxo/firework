import "server-only";

import { db } from "@/lib/db";
import { canRevealIndividualResponses } from "@/features/survey/anonymity";
import { questionSchema, type Question } from "@/features/survey/schema";

export async function getOpenSurvey(projectId: string) {
  const now = new Date();
  const survey = await db.survey.findFirst({
    where: {
      projectId,
      isOpen: true,
      opensAt: { lte: now },
      OR: [{ closesAt: null }, { closesAt: { gte: now } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!survey) return null;

  const questions = questionSchema.array().safeParse(survey.questions);
  return questions.success ? { ...survey, questions: questions.data } : null;
}

/** 이 사람이 이미 응답했는지. 응답 "내용"은 조회하지 않는다 — 조회할 방법도 없다. */
export async function hasResponded(surveyId: string, userId: string | undefined) {
  if (!userId) return false;
  const row = await db.surveyParticipation.findUnique({
    where: { surveyId_userId: { surveyId, userId } },
    select: { createdAt: true },
  });
  return Boolean(row);
}

export type RatingSummary = {
  questionId: string;
  label: string;
  average: number;
  max: number;
  distribution: number[];
};

export type ChoiceSummary = {
  questionId: string;
  label: string;
  counts: { option: string; count: number }[];
};

export type TextResponses = { questionId: string; label: string; answers: string[] };

export type SurveyResults = {
  surveyId: string;
  title: string;
  /** 실제로 접수된 응답 수. 답변 내용과 이어지지 않는 값이라 그대로 보여준다. */
  responseCount: number;
  /** 응답이 적으면 결과를 감춘다. 내용이 곧 작성자를 가리키기 때문이다. */
  individualRevealed: boolean;
  /**
   * 아래 집계가 실제로 몇 건에서 나왔는지. 3의 배수로만 늘어난다.
   * responseCount 와 다를 수 있고, 그 차이는 아직 공개되지 않은 응답 수다.
   */
  revealedCount: number;
  ratings: RatingSummary[];
  choices: ChoiceSummary[];
  texts: TextResponses[];
};

/**
 * 제작자에게 보여줄 결과.
 *
 * **답변에서 나온 값은 전부 공개된 묶음에서만 계산한다.** 자유서술만 자르고 평점·선택
 * 집계를 전체 응답으로 내면, 두 시점을 빼는 것만으로 새 응답 한 건을 복원할 수 있다.
 *
 *     3건일 때 평점 합계 9 (평균 3.0)
 *     4건일 때 평균 3.5  →  4 × 3.5 − 9 = 5
 *
 * 방금 들어온 응답이 5점을 줬다는 것이 그대로 드러난다. 선택 분포도 마찬가지로
 * 두 시점의 차이가 곧 새 응답의 선택이다. 그래서 평균·분포·선택 수까지 모두
 * revealed 집합에서만 낸다.
 *
 * 접수 건수(responseCount)는 그대로 보여준다. 그 숫자만으로는 누가 무엇을 썼는지
 * 좁혀지지 않고, 제작자가 응답이 쌓이는 중임을 알 수 있어야 하기 때문이다.
 */
export async function getSurveyResults(surveyId: string): Promise<SurveyResults | null> {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: { id: true, title: true, questions: true },
  });
  if (!survey) return null;

  const parsedQuestions = questionSchema.array().safeParse(survey.questions);
  if (!parsedQuestions.success) return null;
  const questions: Question[] = parsedQuestions.data;

  // 응답 행에는 시간도 순번도 없다. 돌아오는 순서에 의미가 없으므로 그대로 쓴다.
  const responses = await db.surveyResponse.findMany({
    where: { surveyId },
    select: { answers: true, revealed: true },
  });

  const responseCount = responses.length;

  // 무엇을 공개할지는 응답이 들어올 때 이미 정해졌고 그 결정이 revealed 에 박혀 있다.
  // 여기서 다시 고르지 않는다 — 조회할 때마다 계산하면 묶음의 구성원이 흔들린다.
  const revealedRows = responses
    .filter((r) => r.revealed)
    .map((r) => r.answers as Record<string, unknown>);
  const revealedCount = revealedRows.length;

  // 공개된 묶음이 없으면 답변에서 나온 값은 하나도 내보내지 않는다.
  const individualRevealed = canRevealIndividualResponses(revealedCount);

  const ratings: RatingSummary[] = [];
  const choices: ChoiceSummary[] = [];
  const texts: TextResponses[] = [];

  for (const q of questions) {
    switch (q.type) {
      case "rating": {
        const values = revealedRows
          .map((a) => a[q.id])
          .filter((v): v is number => typeof v === "number");
        const distribution = Array.from({ length: q.max }, (_, i) =>
          values.filter((v) => v === i + 1).length,
        );
        ratings.push({
          questionId: q.id,
          label: q.label,
          average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
          max: q.max,
          distribution,
        });
        break;
      }
      case "choice": {
        const counts = q.options.map((option) => ({
          option,
          count: revealedRows.filter((a) => {
            const v = a[q.id];
            return Array.isArray(v) ? v.includes(option) : v === option;
          }).length,
        }));
        choices.push({ questionId: q.id, label: q.label, counts });
        break;
      }
      case "text": {
        const answers = revealedRows
          .map((a) => a[q.id])
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
        texts.push({ questionId: q.id, label: q.label, answers });
        break;
      }
    }
  }

  return {
    surveyId: survey.id,
    title: survey.title,
    responseCount,
    individualRevealed,
    revealedCount,
    ratings,
    choices,
    texts,
  };
}

export async function listProjectSurveys(projectId: string) {
  return db.survey.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      isOpen: true,
      closesAt: true,
      createdAt: true,
      _count: { select: { responses: true } },
      raffles: { select: { id: true, status: true, prizeName: true } },
    },
  });
}
