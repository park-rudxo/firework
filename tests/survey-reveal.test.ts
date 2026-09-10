import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 개별 응답 공개는 3건 묶음 단위다. 그 판단이 제출 경로에서 일어나고,
 * 결과를 조회할 때 다시 계산되지 않아야 한다 — 다시 계산하면 묶음의 구성원이 흔들린다.
 */
const mocks = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
  });
  return {
    db: {
      survey: model(),
      surveyResponse: model(),
      surveyParticipation: model(),
      raffle: model(),
      raffleEntry: model(),
      project: model(),
      projectMember: model(),
      projectStatDaily: model(),
      notification: model(),
      $transaction: vi.fn(),
    },
    viewer: vi.fn(),
    teamMember: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/session", () => ({
  requireNamedViewer: mocks.viewer,
  requireViewer: mocks.viewer,
}));
vi.mock("@/features/community/access", () => ({
  isProjectTeamMember: mocks.teamMember,
  canManageProject: vi.fn(),
}));
vi.mock("@/features/notification/create", () => ({ notify: vi.fn() }));
vi.mock("@/features/curation/stats", () => ({ bumpStat: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { submitSurveyResponse } from "@/features/survey/actions";

const QUESTIONS = [
  { id: "good", type: "text", label: "좋았던 점", required: false, maxLength: 1000 },
];

function form(answer: string) {
  const f = new FormData();
  f.set("good", answer);
  return f;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.$transaction.mockImplementation((fn) => fn(mocks.db));
  mocks.viewer.mockResolvedValue({ id: "kim" });
  mocks.teamMember.mockResolvedValue(false);
  mocks.db.survey.findUnique.mockResolvedValue({
    id: "survey",
    isOpen: true,
    opensAt: new Date(Date.now() - 1000),
    closesAt: null,
    questions: QUESTIONS,
    title: "설문",
    project: { id: "project", slug: "app", status: "PUBLISHED", ownerId: "owner", name: "모아모아" },
  });
  mocks.db.raffle.findFirst.mockResolvedValue(null);
  mocks.db.surveyResponse.count.mockResolvedValue(1);
});

describe("응답 제출과 묶음 공개", () => {
  it("응답 행은 감춘 상태로 들어간다", async () => {
    await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
    const data = mocks.db.surveyResponse.create.mock.calls[0]![0].data;
    // revealed 를 명시하지 않으면 스키마 기본값(false)이다.
    expect(data.revealed).toBeUndefined();
    expect(data).not.toHaveProperty("userId");
  });

  it("3의 배수가 아니면 아무것도 열지 않는다", async () => {
    for (const count of [1, 2, 4, 5, 7]) {
      vi.clearAllMocks();
      mocks.db.$transaction.mockImplementation((fn) => fn(mocks.db));
      mocks.db.surveyResponse.count.mockResolvedValue(count);
      await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
      expect(mocks.db.surveyResponse.updateMany).not.toHaveBeenCalled();
    }
  });

  it("3의 배수에 닿으면 감춰둔 것을 한꺼번에 연다", async () => {
    for (const count of [3, 6, 9]) {
      vi.clearAllMocks();
      mocks.db.$transaction.mockImplementation((fn) => fn(mocks.db));
      mocks.db.surveyResponse.count.mockResolvedValue(count);
      await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));

      const call = mocks.db.surveyResponse.updateMany.mock.calls[0]![0];
      expect(call.where).toMatchObject({ surveyId: "survey", revealed: false });
      expect(call.data).toEqual({ revealed: true });
    }
  });

  it("공개 여부를 정하는 일이 응답 생성과 같은 트랜잭션 안에 있다", async () => {
    mocks.db.surveyResponse.count.mockResolvedValue(3);
    await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
    // 갈라지면 응답은 들어갔는데 묶음이 안 열린 상태가 남는다.
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.db.surveyResponse.create).toHaveBeenCalled();
    expect(mocks.db.surveyResponse.updateMany).toHaveBeenCalled();
  });

  it("팀원은 자기 팀 설문에 응답할 수 없다", async () => {
    // 등록자만 막으면 나머지 팀원이 추첨 응모권을 나눠 가지면 그만이다.
    mocks.teamMember.mockResolvedValue(true);
    const result = await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
    expect(result.error).toBeTruthy();
    expect(mocks.db.surveyResponse.create).not.toHaveBeenCalled();
  });
});
