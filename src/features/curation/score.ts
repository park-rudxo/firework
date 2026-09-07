import "server-only";

import { db } from "@/lib/db";

/**
 * 인기 점수 가중치.
 *
 * 관심 등록이 가장 무겁다. "계속 지켜보겠다"는 신호라 한 번 눌리기 어렵기 때문이다.
 * 조회는 봇과 우연한 유입이 섞이므로 거의 세지 않는다.
 */
export const WEIGHTS = {
  follows: 3,
  tries: 2,
  surveyResponses: 2,
  likes: 1,
  views: 0.1,
} as const;

export type ScoredProject = { projectId: string; score: number };

/**
 * 기간 내 반응을 모아 점수를 매긴다. since 를 주지 않으면 전체 기간(역대 인기)이다.
 *
 * 좋아요·관심·써봤어요는 누적 카운터가 아니라 피벗 테이블의 createdAt 으로 센다.
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
      _sum: { views: true, surveyResponses: true },
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
    add(row.projectId, (row._sum.views ?? 0) * WEIGHTS.views);
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
