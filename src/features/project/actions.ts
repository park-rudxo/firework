"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import {
  canonicalRepoUrl,
  fetchRepoSnapshot,
  GithubError,
  parseRepoUrl,
  SNAPSHOT_TTL_MS,
  verifyOwnership,
} from "@/lib/github";
import { requireNamedViewer, requireViewer } from "@/lib/session";
import { canManageProject } from "@/features/community/access";
import { canAdminister } from "@/features/community/policy";
import {
  projectInputFromFormData,
  projectInputSchema,
  slugify,
} from "@/features/project/schema";

// "use server" 파일은 async 함수만 export 할 수 있다. 타입은 지워지므로 괜찮지만
// 상수는 내보낼 수 없어서 { error: null } 을 그대로 쓴다.
export type ActionState = { error: string | null; fieldErrors?: Record<string, string[]> };

/** 이미 쓰이는 슬러그면 뒤에 짧은 접미사를 붙인다. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = await db.project.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createProject(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  // UI 에서 게이트를 걸어두더라도 Server Action 은 직접 호출될 수 있다. 방어는 여기서 한다.
  const viewer = await requireNamedViewer();

  const parsed = projectInputSchema.safeParse(projectInputFromFormData(form));
  if (!parsed.success) {
    return {
      error: "입력을 확인해주세요.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;

  // 저장소는 선택이다. 넣었을 때만 중복 검사·스냅샷·소유권 확인이 따라붙는다.
  const ref = input.repoUrl ? parseRepoUrl(input.repoUrl) : null;

  if (ref) {
    const existing = await db.project.findFirst({
      where: { repoUrl: canonicalRepoUrl(ref), status: { not: "REMOVED" } },
      select: { slug: true },
    });
    if (existing) return { error: "이미 등록된 저장소입니다." };
  }

  let snapshot = null;
  if (ref) {
    try {
      snapshot = await fetchRepoSnapshot(ref);
    } catch (err) {
      if (err instanceof GithubError) return { error: err.message };
      throw err;
    }
  }

  // GitHub 계정을 연결하지 않았으면 확인할 근거가 없다. 그때는 미확인으로 둔다.
  const ownershipVerified =
    ref && viewer.githubLogin
      ? await verifyOwnership(ref, viewer.githubLogin).catch(() => false)
      : false;

  const slug = await uniqueSlug(input.name);

  await db.project.create({
    data: {
      slug,
      name: input.name,
      tagline: input.tagline,
      description: input.description,
      category: input.category,
      tags: input.tags,
      repoUrl: ref ? canonicalRepoUrl(ref) : null,
      demoUrl: input.demoUrl,
      iconUrl: input.iconUrl,
      screenshots: input.screenshots,
      ownerId: viewer.id,
      ownershipVerified,
      status: "DRAFT",
      members: {
        create: { userId: viewer.id, role: "OWNER" },
      },
      ...(snapshot
        ? {
            snapshot: {
              create: {
                owner: snapshot.owner,
                repo: snapshot.repo,
                description: snapshot.description,
                stars: snapshot.stars,
                forks: snapshot.forks,
                openIssues: snapshot.openIssues,
                primaryLanguage: snapshot.primaryLanguage,
                languages: snapshot.languages,
                license: snapshot.license,
                topics: snapshot.topics,
                archived: snapshot.archived,
                pushedAt: snapshot.pushedAt,
                readmeHtml: snapshot.readmeHtml,
              },
            },
          }
        : {}),
    },
  });

  // 슬러그에는 한글이 그대로 남는다(slugify 참고). 리다이렉트는 Location 헤더로 나가는데
  // 헤더에는 ASCII 만 실을 수 있어서, 인코딩하지 않으면 등록 마지막 단계에서 500 이 난다.
  redirect(`/projects/${encodeURIComponent(slug)}/edit?created=1`);
}

export async function updateProject(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const viewer = await requireViewer();

  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, repoUrl: true },
  });
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };
  // 등록자 한 명이 아니라 관리 팀이 수정할 수 있다. 판정은 community/policy.ts 하나에서 온다.
  if (!(await canManageProject(project, viewer.id))) {
    return { error: "이 프로젝트의 관리 팀만 수정할 수 있습니다." };
  }

  const parsed = projectInputSchema.safeParse(projectInputFromFormData(form));
  if (!parsed.success) {
    return {
      error: "입력을 확인해주세요.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const nextRef = input.repoUrl ? parseRepoUrl(input.repoUrl) : null;
  const nextRepoUrl = nextRef ? canonicalRepoUrl(nextRef) : null;
  if (nextRepoUrl && nextRepoUrl !== project.repoUrl) {
    const duplicate = await db.project.findFirst({ where: { repoUrl: nextRepoUrl, id: { not: project.id }, status: { not: "REMOVED" } } });
    if (duplicate) return { error: "이미 등록된 저장소입니다." };
  }
  const verified = nextRepoUrl !== project.repoUrl
    ? Boolean(nextRef && viewer.githubLogin && await verifyOwnership(nextRef, viewer.githubLogin).catch(() => false))
    : undefined;

  await db.project.update({
    where: { id: project.id },
    data: {
      name: input.name,
      tagline: input.tagline,
      description: input.description,
      category: input.category,
      tags: input.tags,
      repoUrl: nextRepoUrl,
      ...(verified !== undefined ? { ownershipVerified: verified } : {}),
      demoUrl: input.demoUrl,
      iconUrl: input.iconUrl,
      screenshots: input.screenshots,
    },
  });

  // 저장소를 바꿨다면 스냅샷은 낡은 것이므로 즉시 다시 받는다.
  // 저장소를 지웠다면 남은 스냅샷은 다른 저장소의 정보이므로 같이 지운다.
  if (nextRepoUrl !== project.repoUrl) {
    if (nextRepoUrl) {
      await refreshSnapshot(project.id, nextRepoUrl, { force: true });
    } else {
      await db.githubRepoSnapshot.deleteMany({ where: { projectId: project.id } });
    }
  }

  revalidatePath(`/projects/${slug}`);
  return { error: null };
}

export async function publishProject(slug: string): Promise<ActionState> {
  const viewer = await requireViewer();
  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, status: true, publishedAt: true },
  });
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };
  // 공개 여부는 되돌리기 어려운 결정이라 등록자만 정한다.
  if (!canAdminister(project.ownerId, viewer.id)) return { error: "등록자만 공개할 수 있습니다." };
  if (project.status === "HIDDEN" || project.status === "REMOVED") {
    return { error: "관리자 조치 중인 프로젝트는 공개할 수 없습니다." };
  }

  await db.project.update({
    where: { id: project.id },
    data: {
      status: "PUBLISHED",
      // 최초 공개 시각은 "최근 출시" 정렬 기준이므로 다시 공개해도 덮어쓰지 않는다.
      publishedAt: project.publishedAt ?? new Date(),
    },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${slug}`);
  return { error: null };
}

export async function unpublishProject(slug: string): Promise<ActionState> {
  const viewer = await requireViewer();
  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, status: true },
  });
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };
  if (!canAdminister(project.ownerId, viewer.id)) return { error: "등록자만 되돌릴 수 있습니다." };
  if (project.status !== "PUBLISHED") return { error: null };

  await db.project.update({ where: { id: project.id }, data: { status: "DRAFT" } });
  revalidatePath("/projects");
  revalidatePath(`/projects/${slug}`);
  return { error: null };
}

/**
 * GitHub 스냅샷 갱신. TTL 안이면 아무것도 하지 않는다.
 * 상세 페이지 렌더 중에도 불리므로 실패해도 페이지를 깨뜨리지 않는다.
 */
export async function refreshSnapshot(
  projectId: string,
  repoUrl: string | null,
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  const ref = repoUrl ? parseRepoUrl(repoUrl) : null;
  if (!ref) return;

  if (!force) {
    const current = await db.githubRepoSnapshot.findUnique({
      where: { projectId },
      select: { fetchedAt: true },
    });
    if (current && Date.now() - current.fetchedAt.getTime() < SNAPSHOT_TTL_MS) return;
  }

  try {
    const snapshot = await fetchRepoSnapshot(ref);
    const data = {
      owner: snapshot.owner,
      repo: snapshot.repo,
      description: snapshot.description,
      stars: snapshot.stars,
      forks: snapshot.forks,
      openIssues: snapshot.openIssues,
      primaryLanguage: snapshot.primaryLanguage,
      languages: snapshot.languages,
      license: snapshot.license,
      topics: snapshot.topics,
      archived: snapshot.archived,
      pushedAt: snapshot.pushedAt,
      readmeHtml: snapshot.readmeHtml,
      fetchedAt: new Date(),
    };
    await db.githubRepoSnapshot.upsert({
      where: { projectId },
      create: { projectId, ...data },
      update: data,
    });
  } catch {
    // 호출 한도나 일시적 장애로 갱신에 실패해도 기존 스냅샷으로 계속 보여준다.
  }
}

// ── 반응 토글 ────────────────────────────────────────────────

async function togglePivot(
  slug: string,
  kind: "like" | "follow" | "try",
): Promise<{ active: boolean }> {
  const viewer = await requireViewer();
  const project = await db.project.findFirst({ where: { slug, status: "PUBLISHED" }, select: { id: true } });
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

  const where = { projectId_userId: { projectId: project.id, userId: viewer.id } };
  const data = { projectId: project.id, userId: viewer.id };

  // 델리게이트를 변수에 담으면 세 모델의 호출 시그니처가 합집합이 되어 호출할 수 없다.
  // 각 분기에서 직접 부른다.
  //
  // 인기 점수는 이 피벗 테이블의 createdAt 을 세므로 별도 카운터를 올리지 않는다.
  // 껐다 켜기를 반복해도 행이 하나 생겼다 사라질 뿐 점수가 누적되지 않는다.
  let active: boolean;
  switch (kind) {
    case "like": {
      const existing = await db.projectLike.findUnique({ where, select: { createdAt: true } });
      if (existing) await db.projectLike.delete({ where });
      else await db.projectLike.create({ data });
      active = !existing;
      break;
    }
    case "follow": {
      const existing = await db.projectFollow.findUnique({ where, select: { createdAt: true } });
      if (existing) await db.projectFollow.delete({ where });
      else await db.projectFollow.create({ data });
      active = !existing;
      break;
    }
    case "try": {
      const existing = await db.projectTry.findUnique({ where, select: { createdAt: true } });
      if (existing) await db.projectTry.delete({ where });
      else await db.projectTry.create({ data });
      active = !existing;
      break;
    }
  }

  revalidatePath(`/projects/${slug}`);
  return { active };
}

export async function toggleLike(slug: string) {
  return togglePivot(slug, "like");
}

export async function toggleFollow(slug: string) {
  return togglePivot(slug, "follow");
}

export async function toggleTry(slug: string) {
  return togglePivot(slug, "try");
}
