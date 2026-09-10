import "server-only";

import { db } from "@/lib/db";

/**
 * 인기 점수 가중치.
 *
 * 구독이 가장 무겁다. "계속 지켜보겠다"는 신호라 한 번 눌리기 어렵기 때문이다.
 *
 * **조회수는 여기 없다.** 예전에는 0.1 로 아주 작게 넣었는데, 상세 페이지는 렌더될
 * 때마다 조회수를 올린다. 같은 사람이 새로고침만 해도 오르고, 만든 사람이 자기
 * 페이지를 열어도 오른다. 가중치가 아무리 작아도 무한히 누를 수 있는 버튼을 점수에
 * 넣으면 그 점수는 순위가 아니라 새로고침 횟수가 된다.
 * 조회수는 계속 세지만 제작자에게 보여주는 지표로만 쓴다.
 *
 * "써봤어요" 도 실제 사용을 확인한 값이 아니라 본인이 눌러 신고한 값이다.
 * 그래서 구독보다 가볍게 둔다.
 */
export const WEIGHTS = {
  follows: 3,
  surveyResponses: 2,
  tries: 2,
  likes: 1,
} as const;

export type ScoredProject = { projectId: string; score: number };

/**
 * 기간 내 반응을 모아 점수를 매긴다. since 를 주지 않으면 전체 기간(역대 인기)이다.
 *
 * 좋아요·구독·써봤어요는 누적 카운터가 아니라 피벗 테이블의 createdAt 으로 센다.
 * 누적 카운터였다면 껐다 켜기를 반복해 점수를 부풀릴 수 있었다.
 */
export async function scoreProjects(since?: Date): Promise<Map<string, number>> {
  const createdAtFilter = since ? { createdAt: { gte: since } } : {};
  const dayFilter = since ? { day: { gte: since } } : {};

  const [likes, follows, tries, daily] = await Promise.all([
    db.projectLike.groupBy({ by: ["projectId"], where: createdAtFilter, _count: { _all: true } }),
    db.projectFollow.groupBy({ by: ["projectId"], where: createdAtFilter, _count: { _all: true } }),
    db.projectTry.groupBy({ by: ["projectId"], where: createdAtFilter, _count: { _all: true } }),
    // 설문 응답 수도 여기서 나온다. 응답 행에는 시간이 없어(익명성) 기간으로
    // 셀 수 있는 곳이 이 집계뿐이다.
    db.projectStatDaily.groupBy({
      by: ["projectId"],
      where: dayFilter,
      _sum: { surveyResponses: true },
    }),
  ]);

  const score = new Map<string, number>();
  const add = (projectId: string, value: number) => {
    if (value === 0) return;
    score.set(projectId, (score.get(projectId) ?? 0) + value);
  };

  for (const row of likes) add(row.projectId, row._count._all * WEIGHTS.likes);
  for (const row of follows) add(row.projectId, row._count._all * WEIGHTS.follows);
  for (const row of tries) add(row.projectId, row._count._all * WEIGHTS.tries);
  for (const row of daily) {
    add(row.projectId, (row._sum.surveyResponses ?? 0) * WEIGHTS.surveyResponses);
  }

  return score;
}

/** 점수 상위 프로젝트 id 목록. */
export async function topProjectIds(limit: number, since?: Date): Promise<string[]> {
  const score = await scoreProjects(since);
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([projectId]) => projectId);
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
