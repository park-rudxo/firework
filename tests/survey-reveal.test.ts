import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 개별 응답 공개는 3건 묶음 단위다. 그 판단이 제출 경로에서 일어나고,
 * 결과를 조회할 때 다시 계산되지 않아야 한다 — 다시 계산하면 묶음의 구성원이 흔들린다.
 *
 * 여기서 보는 것은 **모양**이다. 같은 설문에 동시에 제출될 때의 경합은 목으로 재현되지
 * 않으므로 실제 PostgreSQL 을 지나는 e2e/survey-concurrency.spec.ts 가 맡는다.
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
      $queryRaw: vi.fn(),
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
const notify = vi.hoisted(() => vi.fn());
vi.mock("@/features/notification/create", () => ({ notify }));
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
  mocks.db.$queryRaw.mockResolvedValue([{ id: "survey" }]);
  // 이미 공개된 건수 / 아직 안 열린 행들
  mocks.db.surveyResponse.count.mockResolvedValue(0);
  mocks.db.surveyResponse.findMany.mockResolvedValue([{ id: "a" }]);
});

/** 아직 안 열린 응답이 n 건 있는 상태로 만든다. */
function hidden(n: number, alreadyRevealed = 0) {
  mocks.db.surveyResponse.count.mockResolvedValue(alreadyRevealed);
  mocks.db.surveyResponse.findMany.mockResolvedValue(
    Array.from({ length: n }, (_, i) => ({ id: `h${i}` })),
  );
}

describe("응답 제출과 묶음 공개", () => {
  it("응답 행은 감춘 상태로 들어간다", async () => {
    await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
    const data = mocks.db.surveyResponse.create.mock.calls[0]![0].data;
    // revealed 를 명시하지 않으면 스키마 기본값(false)이다.
    expect(data.revealed).toBeUndefined();
    expect(data).not.toHaveProperty("userId");
  });

  it("같은 설문의 제출을 직렬화하는 잠금을 먼저 잡는다", async () => {
    // 트랜잭션만으로는 두 제출이 각자 "3건이 됐다" 고 보아 둘 다 묶음을 열 수 있다.
    hidden(1);
    await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));

    expect(mocks.db.$queryRaw).toHaveBeenCalled();
    const [strings, ...values] = mocks.db.$queryRaw.mock.calls[0]!;
    expect(strings.join("?")).toContain("FOR UPDATE");
    // 값은 파라미터로 바인딩한다. 문자열에 이어붙이지 않는다.
    expect(values).toEqual(["survey"]);
  });

  it("안 열린 것이 3건 미만이면 아무것도 열지 않는다", async () => {
    for (const n of [1, 2]) {
      vi.clearAllMocks();
      mocks.db.$transaction.mockImplementation((fn) => fn(mocks.db));
      mocks.db.$queryRaw.mockResolvedValue([]);
      hidden(n);
      await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
      expect(mocks.db.surveyResponse.updateMany).not.toHaveBeenCalled();
    }
  });

  it("안 열린 것이 3건 모이면 그 3건만 연다", async () => {
    hidden(3);
    await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));

    const call = mocks.db.surveyResponse.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: { in: ["h0", "h1", "h2"] } });
    expect(call.data).toEqual({ revealed: true });
  });

  it("전체 건수가 아니라 안 열린 건수로 센다", async () => {
    // 예전에 5건이 전부 공개된 설문. 전체는 6건이지만 안 열린 건 1건뿐이다.
    hidden(1, 5);
    await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
    expect(mocks.db.surveyResponse.updateMany).not.toHaveBeenCalled();
  });

  it("공개 여부를 정하는 일이 응답 생성과 같은 트랜잭션 안에 있다", async () => {
    hidden(3);
    await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
    // 갈라지면 응답은 들어갔는데 묶음이 안 열린 상태가 남는다.
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.db.surveyResponse.create).toHaveBeenCalled();
    expect(mocks.db.surveyResponse.updateMany).toHaveBeenCalled();
  });

  it("첫 묶음이 열릴 때만 제작자에게 알린다", async () => {
    hidden(3, 0);
    await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("두 번째 묶음에서는 다시 알리지 않는다", async () => {
    hidden(3, 3);
    await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
    expect(notify).not.toHaveBeenCalled();
  });

  it("아무것도 열리지 않으면 알리지 않는다", async () => {
    hidden(2, 0);
    await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
    expect(notify).not.toHaveBeenCalled();
  });

  it("팀원은 자기 팀 설문에 응답할 수 없다", async () => {
    // 등록자만 막으면 나머지 팀원이 추첨 응모권을 나눠 가지면 그만이다.
    mocks.teamMember.mockResolvedValue(true);
    const result = await submitSurveyResponse("survey", { ok: false, error: null }, form("좋았어요"));
    expect(result.error).toBeTruthy();
    expect(mocks.db.surveyResponse.create).not.toHaveBeenCalled();
  });
});
