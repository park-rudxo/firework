import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 결과 화면이 **차분으로 새 응답을 흘리지 않는지** 본다.
 *
 * 자유서술만 묶음으로 자르고 평점·선택 집계를 전체 응답으로 내면, 두 시점을 빼는
 * 것만으로 방금 들어온 응답 한 건을 복원할 수 있다.
 *
 *     3건일 때 합계 9 (평균 3.0)
 *     4건일 때 평균 3.5  →  4 × 3.5 − 9 = 5
 *
 * 그래서 답변에서 나온 값은 전부 공개된 묶음에서만 계산해야 한다.
 */
const mocks = vi.hoisted(() => ({
  db: {
    survey: { findUnique: vi.fn() },
    surveyResponse: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { getSurveyResults } from "@/features/survey/queries";

const QUESTIONS = [
  { id: "score", type: "rating", label: "만족도", required: true, max: 5 },
  {
    id: "pick",
    type: "choice",
    label: "추천하시겠어요",
    required: true,
    options: ["추천", "보통", "비추천"],
    multiple: false,
  },
  { id: "free", type: "text", label: "좋았던 점", required: false, maxLength: 1000 },
];

/** revealed 는 3의 배수 지점까지만 true 다 — 실제 제출 경로가 그렇게 만든다. */
function responses(rows: { score: number; pick: string; free: string }[]) {
  const revealedCount = Math.floor(rows.length / 3) * 3;
  return rows.map((answers, i) => ({ answers, revealed: i < revealedCount }));
}

async function results(rows: { score: number; pick: string; free: string }[]) {
  mocks.db.survey.findUnique.mockResolvedValue({
    id: "s1",
    title: "설문",
    questions: QUESTIONS,
  });
  mocks.db.surveyResponse.findMany.mockResolvedValue(responses(rows));
  const out = await getSurveyResults("s1");
  if (!out) throw new Error("결과가 없습니다");
  return out;
}

const THREE = [
  { score: 3, pick: "추천", free: "가" },
  { score: 3, pick: "추천", free: "나" },
  { score: 3, pick: "보통", free: "다" },
];
const FOURTH = { score: 5, pick: "비추천", free: "라" };
const FIFTH = { score: 1, pick: "비추천", free: "마" };
const SIXTH = { score: 4, pick: "보통", free: "바" };

/** 답변에서 나온 값만 모은다. 접수 건수는 제외한다 — 그건 공개해도 되는 값이다. */
function answerDerived(r: Awaited<ReturnType<typeof results>>) {
  return JSON.stringify({
    revealedCount: r.revealedCount,
    ratings: r.ratings,
    choices: r.choices,
    texts: r.texts,
  });
}

beforeEach(() => vi.resetAllMocks());

describe("공개되지 않은 응답은 어떤 집계에도 들어가지 않는다", () => {
  it("3 → 4 → 5건에서 답변 기반 결과가 전부 동일하다", async () => {
    const at3 = answerDerived(await results(THREE));
    const at4 = answerDerived(await results([...THREE, FOURTH]));
    const at5 = answerDerived(await results([...THREE, FOURTH, FIFTH]));

    expect(at4).toBe(at3);
    expect(at5).toBe(at3);
  });

  it("평균으로 새 응답의 점수를 복원할 수 없다", async () => {
    const at3 = await results(THREE);
    const at4 = await results([...THREE, FOURTH]);

    // 전체로 계산했다면 4×3.5−3×3.0 = 5 로 FOURTH 의 점수가 드러난다.
    expect(at3.ratings[0]!.average).toBe(3);
    expect(at4.ratings[0]!.average).toBe(3);
  });

  it("선택 분포 차이로 새 응답의 선택을 알 수 없다", async () => {
    const at3 = await results(THREE);
    const at4 = await results([...THREE, FOURTH]);

    const counts = (r: Awaited<ReturnType<typeof results>>) =>
      r.choices[0]!.counts.map((c) => c.count);
    expect(counts(at4)).toEqual(counts(at3));
    // FOURTH 는 "비추천" 인데 3건 기준에는 비추천이 0 이어야 한다.
    expect(at4.choices[0]!.counts.find((c) => c.option === "비추천")!.count).toBe(0);
  });

  it("접수 건수는 늘어나되 공개 건수는 묶음 단위로만 늘어난다", async () => {
    const at4 = await results([...THREE, FOURTH]);
    expect(at4.responseCount).toBe(4);
    expect(at4.revealedCount).toBe(3);
  });

  it("6건째에 다음 묶음이 함께 반영된다", async () => {
    const at6 = await results([...THREE, FOURTH, FIFTH, SIXTH]);
    expect(at6.revealedCount).toBe(6);
    expect(at6.responseCount).toBe(6);
    // 이제 FOURTH·FIFTH·SIXTH 가 한꺼번에 들어온다. 어느 것이 새 것인지 가려진다.
    expect(at6.ratings[0]!.average).toBeCloseTo((3 + 3 + 3 + 5 + 1 + 4) / 6);
    expect(at6.texts[0]!.answers).toHaveLength(6);
  });

  it("3건 미만이면 평점·선택·자유서술 어느 것도 값이 나오지 않는다", async () => {
    const at2 = await results(THREE.slice(0, 2));

    expect(at2.responseCount).toBe(2);
    expect(at2.revealedCount).toBe(0);
    expect(at2.individualRevealed).toBe(false);
    expect(at2.ratings[0]!.average).toBe(0);
    expect(at2.ratings[0]!.distribution).toEqual([0, 0, 0, 0, 0]);
    expect(at2.choices[0]!.counts.every((c) => c.count === 0)).toBe(true);
    expect(at2.texts[0]!.answers).toEqual([]);
  });
});

describe("무응답이 섞여도 마찬가지다", () => {
  const withBlanks = [
    { score: 4, pick: "추천", free: "" },
    { score: 2, pick: "", free: "나" },
    { score: 0, pick: "보통", free: "다" },
  ];

  it("빈 자유서술은 목록에 넣지 않는다", async () => {
    const r = await results(withBlanks);
    expect(r.texts[0]!.answers).toEqual(["나", "다"]);
  });

  it("선택하지 않은 응답은 어느 항목에도 세지 않는다", async () => {
    const r = await results(withBlanks);
    const total = r.choices[0]!.counts.reduce((a, b) => a + b.count, 0);
    expect(total).toBe(2);
  });

  it("점수를 안 낸 응답이 평균을 끌어내리지 않는다", async () => {
    // 0 은 유효한 평점이 아니지만 숫자라서 걸러지지 않는다. 실제 폼은 1~max 만 받는다.
    const r = await results(withBlanks);
    expect(r.ratings[0]!.distribution).toEqual([0, 1, 0, 1, 0]);
  });

  it("다중 선택도 공개된 묶음에서만 센다", async () => {
    mocks.db.survey.findUnique.mockResolvedValue({
      id: "s1",
      title: "설문",
      questions: [
        { id: "pick", type: "choice", label: "무엇을 쓰셨나요", required: false, options: ["A", "B", "C"], multiple: true },
      ],
    });
    mocks.db.surveyResponse.findMany.mockResolvedValue([
      { answers: { pick: ["A", "B"] }, revealed: true },
      { answers: { pick: ["B"] }, revealed: true },
      { answers: { pick: ["A"] }, revealed: true },
      { answers: { pick: ["C", "A", "B"] }, revealed: false },
    ]);

    const r = (await getSurveyResults("s1"))!;
    expect(r.revealedCount).toBe(3);
    expect(r.choices[0]!.counts).toEqual([
      { option: "A", count: 2 },
      { option: "B", count: 2 },
      { option: "C", count: 0 },
    ]);
  });
});
