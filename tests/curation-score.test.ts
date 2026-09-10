import { describe, expect, it, vi } from "vitest";

// score.ts 는 모듈 최상단에서 db 를 만든다. 여기서 보려는 것은 가중치뿐이라
// 연결을 세우지 않는다.
vi.mock("@/lib/db", () => ({ db: {} }));

import { WEIGHTS } from "@/features/curation/score";

/**
 * 상세 페이지는 렌더될 때마다 조회수를 올린다. 같은 사람이 새로고침만 해도 오르고,
 * 만든 사람이 자기 페이지를 열어도 오른다. 가중치가 아무리 작아도 무한히 누를 수 있는
 * 버튼을 점수에 넣으면 그 점수는 순위가 아니라 새로고침 횟수가 된다.
 */
describe("인기 점수 가중치", () => {
  it("조회수는 점수에 들어가지 않는다", () => {
    expect(WEIGHTS).not.toHaveProperty("views");
    expect(WEIGHTS).not.toHaveProperty("outboundClicks");
  });

  it("되돌릴 수 있는 반응만 담는다", () => {
    // 좋아요·구독·써봤어요는 껐다 켜기를 반복해도 피벗 테이블의 행이 하나 생겼다
    // 사라질 뿐이라 부풀릴 수 없다. 설문 응답은 취소 자체가 안 된다.
    expect(Object.keys(WEIGHTS).sort()).toEqual([
      "follows",
      "likes",
      "surveyResponses",
      "tries",
    ]);
  });

  it("구독이 가장 무겁다", () => {
    // "계속 지켜보겠다" 는 신호라 한 번 눌리기 어렵다.
    // "써봤어요" 는 실제 사용을 확인한 값이 아니라 본인 신고라 더 가볍다.
    const values = Object.values(WEIGHTS);
    expect(WEIGHTS.follows).toBe(Math.max(...values));
    expect(WEIGHTS.follows).toBeGreaterThan(WEIGHTS.tries);
    expect(WEIGHTS.tries).toBeGreaterThan(WEIGHTS.likes);
  });
});

describe("정렬 기준이 한 곳에서만 온다", () => {
  it("목록의 인기 정렬이 좋아요 수를 직접 세지 않는다", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/features/project/queries.ts", "utf8");

    // 홈의 "이번 주 인기"는 여러 반응을 가중 합산하는데 목록은 좋아요만 봤다.
    // 같은 이름으로 다른 순서를 보여주면 사용자는 목록이 틀렸다고 여긴다.
    expect(source).not.toMatch(/popular:\s*\[\{\s*likes/);
    expect(source).toMatch(/sort === "popular"/);
    expect(source).toMatch(/scoreProjects/);
  });
});
