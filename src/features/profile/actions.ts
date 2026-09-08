"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { parseNickname } from "@/features/profile/nickname";
import { requireViewer } from "@/lib/session";

export type ProfileState = { error: string | null; saved: boolean };

const schema = z.object({
  bio: z.string().trim().max(300).optional(),
  ssafyTrack: z.string().trim().max(40).optional(),
});

export async function updateProfile(
  _prev: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  const viewer = await requireViewer();

  // 닉네임은 형식이 곧 내용이라 별도로 읽는다. 어느 칸이 틀렸는지 그대로 돌려준다.
  const nickname = parseNickname(form.get("displayName"));
  if (!nickname.ok) return { error: nickname.error, saved: false };

  const parsed = schema.safeParse({
    bio: String(form.get("bio") ?? "") || undefined,
    ssafyTrack: String(form.get("ssafyTrack") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력을 확인해주세요.", saved: false };
  }

  await db.profile.update({
    where: { userId: viewer.id },
    data: {
      displayName: nickname.value.nickname,
      bio: parsed.data.bio ?? null,
      // 기수는 닉네임 첫 칸이 정본이다. 따로 입력받으면 둘이 어긋나는 상태가 생긴다.
      ssafyGeneration: nickname.value.generation,
      ssafyTrack: parsed.data.ssafyTrack ?? null,
    },
  });

  revalidatePath("/settings/profile");
  return { error: null, saved: true };
}

/**
 * 가입 직후 닉네임만 정하는 경로.
 *
 * 소셜 로그인만 있어서 가입 폼이 없다. 프로바이더가 준 이름("박경도", "kdpark")이
 * 그대로 들어오는데, 이 서비스의 닉네임은 소속 표기라 그 이름으로는 쓸 수 없다.
 * 그래서 첫 로그인 뒤 이 화면을 한 번 세우고, 여기서만 닉네임을 받는다.
 * 소개·트랙까지 같이 받으면 가입 첫 화면이 길어져 그만큼 이탈한다.
 */
export async function setNickname(
  next: string,
  _prev: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  const viewer = await requireViewer();

  const nickname = parseNickname(form.get("displayName"));
  if (!nickname.ok) return { error: nickname.error, saved: false };

  await db.profile.update({
    where: { userId: viewer.id },
    data: {
      displayName: nickname.value.nickname,
      ssafyGeneration: nickname.value.generation,
    },
  });

  // 헤더의 이름과 게이트 판단이 모든 화면에 걸려 있다.
  revalidatePath("/", "layout");
  // 가입 흐름을 끊지 않는다 — 원래 가려던 곳으로 그대로 돌려보낸다.
  redirect(safeNext(next));
}

/** 사이트 밖으로 튕겨보내는 오픈 리다이렉트를 막는다. */
function safeNext(next: string): string {
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
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
