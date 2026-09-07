import "server-only";

import { db } from "@/lib/db";
import { projectCardSelect, PUBLIC_FILTER, type ProjectCard } from "@/features/project/queries";
import { daysAgo, topProjectIds } from "@/features/curation/score";

export type Section = {
  key: string;
  title: string;
  subtitle?: string;
  href: string;
  items: ProjectCard[];
};

/** 점수 순서대로 카드를 채운다. findMany 의 결과 순서는 보장되지 않으므로 다시 정렬한다. */
async function cardsByIds(ids: string[]): Promise<ProjectCard[]> {
  if (ids.length === 0) return [];
  const rows = await db.project.findMany({
    where: { id: { in: ids }, ...PUBLIC_FILTER },
    select: projectCardSelect,
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function editorsPicks(limit: number): Promise<ProjectCard[]> {
  const now = new Date();
  const slots = await db.featuredSlot.findMany({
    where: { startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { order: "asc" },
    take: limit,
    select: { projectId: true },
  });
  return cardsByIds(slots.map((s) => s.projectId));
}

async function weeklyPopular(limit: number): Promise<ProjectCard[]> {
  return cardsByIds(await topProjectIds(limit, daysAgo(7)));
}

async function allTimePopular(limit: number): Promise<ProjectCard[]> {
  return cardsByIds(await topProjectIds(limit));
}

async function recentlyReleased(limit: number): Promise<ProjectCard[]> {
  return db.project.findMany({
    where: PUBLIC_FILTER,
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: projectCardSelect,
  });
}

/** GitHub 에 실제로 커밋이 올라온 순서. 등록만 해두고 방치한 프로젝트는 아래로 내려간다. */
async function recentlyUpdated(limit: number): Promise<ProjectCard[]> {
  return db.project.findMany({
    where: { ...PUBLIC_FILTER, snapshot: { pushedAt: { not: null } } },
    orderBy: { snapshot: { pushedAt: "desc" } },
    take: limit,
    select: projectCardSelect,
  });
}

async function surveyOpen(limit: number): Promise<ProjectCard[]> {
  const now = new Date();
  const surveys = await db.survey.findMany({
    where: {
      isOpen: true,
      opensAt: { lte: now },
      OR: [{ closesAt: null }, { closesAt: { gte: now } }],
      project: PUBLIC_FILTER,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { projectId: true },
  });
  return cardsByIds([...new Set(surveys.map((s) => s.projectId))]);
}

async function raffleClosingSoon(limit: number): Promise<ProjectCard[]> {
  const now = new Date();
  const raffles = await db.raffle.findMany({
    where: { status: "OPEN", closesAt: { gte: now }, project: PUBLIC_FILTER },
    orderBy: { closesAt: "asc" },
    take: limit,
    select: { projectId: true },
  });
  return cardsByIds([...new Set(raffles.map((r) => r.projectId))]);
}

async function recruitingTesters(limit: number): Promise<ProjectCard[]> {
  const now = new Date();
  const events = await db.projectEvent.findMany({
    where: {
      type: "TEST",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      project: PUBLIC_FILTER,
    },
    orderBy: { startsAt: "desc" },
    take: limit,
    select: { projectId: true },
  });
  return cardsByIds([...new Set(events.map((e) => e.projectId))]);
}

/**
 * 홈에 실을 섹션 전체. 각 섹션은 서로 의존하지 않으므로 병렬로 긁는다.
 * 비어 있는 섹션은 화면에서 통째로 빠진다.
 */
export async function homeSections(perSection = 8): Promise<Section[]> {
  const [picks, weekly, allTime, released, updated, surveys, raffles, testers] = await Promise.all([
    editorsPicks(perSection),
    weeklyPopular(perSection),
    allTimePopular(perSection),
    recentlyReleased(perSection),
    recentlyUpdated(perSection),
    surveyOpen(perSection),
    raffleClosingSoon(perSection),
    recruitingTesters(perSection),
  ]);

  const sections: Section[] = [
    {
      key: "picks",
      title: "에디터 추천",
      subtitle: "직접 골랐습니다",
      href: "/projects",
      items: picks,
    },
    {
      key: "raffles",
      title: "곧 마감되는 추첨",
      subtitle: "설문 쓰고 응모하세요",
      href: "/projects",
      items: raffles,
    },
    {
      key: "surveys",
      title: "지금 피드백 받는 중",
      subtitle: "제작자에게 익명으로 전달됩니다",
      href: "/projects",
      items: surveys,
    },
    {
      key: "weekly",
      title: "이번 주 인기",
      subtitle: "최근 7일 반응 기준",
      href: "/projects?sort=popular",
      items: weekly,
    },
    {
      key: "testers",
      title: "베타 테스터 모집 중",
      href: "/calendar",
      items: testers,
    },
    {
      key: "released",
      title: "최근 출시",
      href: "/projects?sort=recent",
      items: released,
    },
    {
      key: "updated",
      title: "최근 업데이트",
      subtitle: "GitHub 커밋 기준",
      href: "/projects?sort=updated",
      items: updated,
    },
    {
      key: "alltime",
      title: "역대 인기",
      href: "/projects?sort=popular",
      items: allTime,
    },
  ];

  return sections.filter((s) => s.items.length > 0);
}
