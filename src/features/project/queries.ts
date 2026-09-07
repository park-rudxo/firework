import "server-only";

import { db } from "@/lib/db";
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

  const orderBy = {
    recent: [{ publishedAt: "desc" as const }],
    popular: [{ likes: { _count: "desc" as const } }, { publishedAt: "desc" as const }],
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
 * 상세 페이지용. 비공개 프로젝트는 소유자에게만 보인다.
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
  if (project.status !== "PUBLISHED" && project.ownerId !== viewerId) return null;

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

export async function listMyProjects(viewerId: string) {
  return db.project.findMany({
    where: { ownerId: viewerId, status: { not: "REMOVED" } },
    orderBy: { updatedAt: "desc" },
    select: {
      ...projectCardSelect,
      status: true,
      _count: { select: { likes: true, follows: true, tries: true, surveys: true, raffles: true } },
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
