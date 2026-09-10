import "server-only";

import { db } from "@/lib/db";
import { scoreProjects } from "@/features/curation/score";
import type { ProjectCategory } from "@prisma/client";

/** 목록·홈에서 카드로 그릴 때 필요한 최소 필드. */
export const projectCardSelect = {
  id: true,
  slug: true,
  name: true,
  tagline: true,
  category: true,
  tags: true,
  iconUrl: true,
  demoUrl: true,
  publishedAt: true,
  ownershipVerified: true,
  snapshot: {
    select: { stars: true, primaryLanguage: true, pushedAt: true },
  },
  _count: { select: { likes: true, follows: true, tries: true } },
} as const;

export type ProjectCard = Awaited<ReturnType<typeof listProjects>>["items"][number];

/**
 * 공개된 프로젝트만 노출한다. DRAFT(작성 중)·HIDDEN(관리자 조치)·REMOVED 는
 * 목록·홈·캘린더 어디에도 나오면 안 된다.
 */
export const PUBLIC_FILTER = { status: "PUBLISHED" as const };

export type ProjectSort = "recent" | "popular" | "updated" | "stars";

export async function listProjects({
  q,
  category,
  tag,
  sort = "recent",
  page = 1,
  perPage = 24,
}: {
  q?: string;
  category?: ProjectCategory;
  tag?: string;
  sort?: ProjectSort;
  page?: number;
  perPage?: number;
}) {
  const where = {
    ...PUBLIC_FILTER,
    ...(category ? { category } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { tagline: { contains: q, mode: "insensitive" as const } },
            { tags: { has: q } },
          ],
        }
      : {}),
  };

  // 홈의 "이번 주 인기"는 여러 반응을 가중 합산하는데, 그 섹션의 "더 보기"가 데려오는
  // 이 목록은 좋아요 수만 봤다. 같은 이름으로 다른 순서를 보여주면 사용자는 목록이
  // 틀렸다고 여긴다. 정렬 기준은 한 곳(scoreProjects)에서만 온다.
  if (sort === "popular") return listByScore({ where, page, perPage });

  const orderBy = {
    recent: [{ publishedAt: "desc" as const }],
    updated: [{ snapshot: { pushedAt: "desc" as const } }],
    stars: [{ snapshot: { stars: "desc" as const } }],
  }[sort];

  const [items, total] = await Promise.all([
    db.project.findMany({
      where,
      orderBy,
      select: projectCardSelect,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.project.count({ where }),
  ]);

  return { items, total, page, perPage, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}

/**
 * 인기 점수 순 목록.
 *
 * 점수는 SQL 한 방으로 나오지 않으므로(반응 테이블 여러 곳을 합산한다) 후보를 먼저
 * 가져와 메모리에서 정렬한다. 점수가 0 인 프로젝트도 목록에서 빠지면 안 되므로
 * 점수 맵에 없는 것은 0 으로 보고 뒤에 붙인다.
 */
async function listByScore({
  where,
  page,
  perPage,
}: {
  where: Record<string, unknown>;
  page: number;
  perPage: number;
}) {
  const [rows, score] = await Promise.all([
    db.project.findMany({ where, select: projectCardSelect }),
    scoreProjects(),
  ]);

  const sorted = rows.sort((a, b) => {
    const diff = (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0);
    if (diff !== 0) return diff;
    // 점수가 같으면 최근 공개된 것을 위로. 등록 순서로 굳어버리지 않게 한다.
    return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
  });

  const total = sorted.length;
  return {
    items: sorted.slice((page - 1) * perPage, page * perPage),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * 상세 페이지용. 비공개 프로젝트는 관리 팀에게만 보인다.
 * viewerId 를 넘기지 않으면 공개된 것만 찾는다.
 */
export async function getProjectBySlug(slug: string, viewerId?: string) {
  const project = await db.project.findUnique({
    where: { slug },
    include: {
      snapshot: true,
      owner: { select: { id: true, name: true, image: true, profile: { select: { displayName: true, githubLogin: true } } } },
      members: {
        select: { role: true, user: { select: { id: true, name: true, image: true } } },
      },
      _count: { select: { likes: true, follows: true, tries: true } },
    },
  });

  if (!project) return null;
  if (project.status === "REMOVED") return null;

  if (project.status !== "PUBLISHED") {
    // 작성 중인 프로젝트를 등록자만 볼 수 있으면 팀은 공개 전에 서로 확인할 수 없다.
    // 팀원으로 올라온 사람은 볼 수 있게 한다.
    const visible =
      Boolean(viewerId) &&
      (project.ownerId === viewerId || project.members.some((m) => m.user.id === viewerId));
    if (!visible) return null;
  }

  return project;
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectBySlug>>>;

/** 현재 사용자의 반응 상태. 로그인 안 했으면 전부 false. */
export async function getViewerReactions(projectId: string, viewerId: string | undefined) {
  if (!viewerId) return { liked: false, following: false, tried: false };

  const key = { projectId_userId: { projectId, userId: viewerId } };
  const [like, follow, tried] = await Promise.all([
    db.projectLike.findUnique({ where: key, select: { createdAt: true } }),
    db.projectFollow.findUnique({ where: key, select: { createdAt: true } }),
    db.projectTry.findUnique({ where: key, select: { createdAt: true } }),
  ]);

  return { liked: Boolean(like), following: Boolean(follow), tried: Boolean(tried) };
}

/**
 * 내 프로젝트. 등록자인 것과 공동 관리자로 참여한 것을 함께 보여준다.
 *
 * 역할까지 함께 준다 — 화면에서 "등록자만 할 수 있는 것" 을 가리려면 필요하고,
 * 없으면 여기서도 ownerId 를 직접 비교하게 된다.
 */
export async function listMyProjects(viewerId: string) {
  return db.project.findMany({
    where: { OR: [{ ownerId: viewerId }, { members: { some: { userId: viewerId, role: { in: ["OWNER", "MAINTAINER"] } } } }], status: { not: "REMOVED" } },
    orderBy: { updatedAt: "desc" },
    select: {
      ...projectCardSelect,
      status: true,
      ownerId: true,
      members: { where: { userId: viewerId }, select: { role: true } },
      _count: { select: { likes: true, follows: true, tries: true, surveys: true, raffles: true, bugs: true } },
    },
  });
}

/** 태그 클라우드용. 공개 프로젝트의 태그만 센다. */
export async function popularTags(limit = 20) {
  const rows = await db.project.findMany({
    where: PUBLIC_FILTER,
    select: { tags: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}
