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
import { requireVerifiedViewer, requireViewer } from "@/lib/session";
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

/** GitHub 계정을 연결하지 않은 사람이 저장소를 붙이려 할 때의 안내. */
const NEED_GITHUB =
  "GitHub 저장소를 등록하려면 GitHub 계정 연결이 필요합니다. 설정에서 연결하시거나, 저장소 없이 서비스 주소만으로 등록하실 수 있습니다.";

export async function createProject(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  // UI 에서 게이트를 걸어두더라도 Server Action 은 직접 호출될 수 있다. 방어는 여기서 한다.
  const viewer = await requireVerifiedViewer();

  const parsed = projectInputSchema.safeParse(projectInputFromFormData(form));
  if (!parsed.success) {
    return {
      error: "입력을 확인해주세요.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;

  // 저장소가 없는 프로젝트도 등록된다. 그때는 GitHub 관련 절차를 전부 건너뛴다.
  const ref = input.repoUrl ? parseRepoUrl(input.repoUrl) : null;
  if (ref && !viewer.githubLogin) return { error: NEED_GITHUB };

  let snapshot: Awaited<ReturnType<typeof fetchRepoSnapshot>> | null = null;
  let ownershipVerified = false;

  if (ref) {
    const existing = await db.project.findFirst({
      where: { repoUrl: canonicalRepoUrl(ref), status: { not: "REMOVED" } },
      select: { slug: true },
    });
    if (existing) {
      return { error: "이미 등록된 저장소입니다." };
    }

    try {
      snapshot = await fetchRepoSnapshot(ref);
    } catch (err) {
      if (err instanceof GithubError) return { error: err.message };
      throw err;
    }

    ownershipVerified = await verifyOwnership(ref, viewer.githubLogin!).catch(() => false);
  }

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
      snapshot: snapshot
        ? {
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
          }
        : undefined,
    },
  });

  redirect(`/projects/${slug}/edit?created=1`);
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
  if (project.ownerId !== viewer.id) return { error: "본인의 프로젝트만 수정할 수 있습니다." };

  const parsed = projectInputSchema.safeParse(projectInputFromFormData(form));
  if (!parsed.success) {
    return {
      error: "입력을 확인해주세요.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const ref = input.repoUrl ? parseRepoUrl(input.repoUrl) : null;
  const nextRepoUrl = ref ? canonicalRepoUrl(ref) : null;
  const repoChanged = nextRepoUrl !== project.repoUrl;

  if (repoChanged && ref) {
    if (!viewer.githubLogin) return { error: NEED_GITHUB };

    const taken = await db.project.findFirst({
      where: { repoUrl: nextRepoUrl, status: { not: "REMOVED" }, id: { not: project.id } },
      select: { slug: true },
    });
    if (taken) return { error: "이미 등록된 저장소입니다." };
  }

  await db.project.update({
    where: { id: project.id },
    data: {
      name: input.name,
      tagline: input.tagline,
      description: input.description,
      category: input.category,
      tags: input.tags,
      repoUrl: nextRepoUrl,
      demoUrl: input.demoUrl,
      iconUrl: input.iconUrl,
      screenshots: input.screenshots,
      // 저장소가 바뀌면 이전 저장소로 받은 확인은 근거를 잃는다. 아래에서 다시 확인한다.
      ...(repoChanged ? { ownershipVerified: false } : {}),
    },
  });

  if (repoChanged) {
    if (ref && viewer.githubLogin) {
      // 저장소를 바꿨다면 스냅샷은 낡은 것이므로 즉시 다시 받는다.
      await refreshSnapshot(project.id, nextRepoUrl, { force: true });
      const verified = await verifyOwnership(ref, viewer.githubLogin).catch(() => false);
      if (verified) {
        await db.project.update({ where: { id: project.id }, data: { ownershipVerified: true } });
      }
    } else {
      // 저장소를 떼어냈다. 스타·언어·README 를 남겨두면 없는 저장소의 정보가 계속 보인다.
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
  if (project.ownerId !== viewer.id) return { error: "본인의 프로젝트만 공개할 수 있습니다." };
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
  if (project.ownerId !== viewer.id) return { error: "본인의 프로젝트만 되돌릴 수 있습니다." };
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
  // 저장소가 없는 프로젝트는 갱신할 것이 없다.
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
  const project = await db.project.findUnique({ where: { slug }, select: { id: true } });
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
