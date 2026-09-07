"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";

export type ProfileState = { error: string | null; saved: boolean };

const schema = z.object({
  displayName: z.string().trim().min(1, "이름을 입력해주세요.").max(40),
  bio: z.string().trim().max(300).optional(),
  // SSAFY 소속은 선택 입력이다. 외부인도 쓸 수 있는 서비스이므로 필수로 두지 않는다.
  ssafyGeneration: z
    .union([z.coerce.number().int().min(1).max(50), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  ssafyTrack: z.string().trim().max(40).optional(),
});

export async function updateProfile(
  _prev: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  const viewer = await requireViewer();

  const parsed = schema.safeParse({
    displayName: form.get("displayName"),
    bio: String(form.get("bio") ?? "") || undefined,
    ssafyGeneration: String(form.get("ssafyGeneration") ?? ""),
    ssafyTrack: String(form.get("ssafyTrack") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력을 확인해주세요.", saved: false };
  }

  await db.profile.update({
    where: { userId: viewer.id },
    data: {
      displayName: parsed.data.displayName,
      bio: parsed.data.bio ?? null,
      ssafyGeneration: parsed.data.ssafyGeneration,
      ssafyTrack: parsed.data.ssafyTrack ?? null,
    },
  });

  revalidatePath("/settings/profile");
  return { error: null, saved: true };
}

/**
 * GitHub 연결 직후 로그인명을 다시 받아온다.
 *
 * 연결 시점에 GitHub 이 응답하지 않으면 githubLogin 이 비어 프로젝트를 올릴 수 없다.
 * 그때 사용자가 직접 누를 수 있는 복구 경로다.
 */
export async function syncGithubLogin(): Promise<ProfileState> {
  const viewer = await requireViewer();

  const account = await db.account.findFirst({
    where: { userId: viewer.id, providerId: "github" },
    select: { accessToken: true },
  });
  if (!account?.accessToken) {
    return { error: "연결된 GitHub 계정이 없습니다. 먼저 연결해주세요.", saved: false };
  }

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return { error: "GitHub 에서 계정 정보를 가져오지 못했습니다.", saved: false };

    const profile = (await res.json()) as { login?: unknown };
    if (typeof profile.login !== "string" || !profile.login) {
      return { error: "GitHub 응답이 올바르지 않습니다.", saved: false };
    }

    await db.profile.update({
      where: { userId: viewer.id },
      data: { githubLogin: profile.login },
    });
  } catch {
    return { error: "GitHub 에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.", saved: false };
  }

  revalidatePath("/settings/profile");
  return { error: null, saved: true };
}
