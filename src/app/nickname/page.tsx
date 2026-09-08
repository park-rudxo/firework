import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserRoundPen } from "lucide-react";

import { NicknameForm } from "@/components/profile/nickname-form";
import { NICKNAME_EXAMPLE } from "@/features/profile/nickname";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "닉네임 정하기" };

/**
 * 가입 직후 한 번 서는 화면.
 *
 * 소셜 로그인만 있어서 가입 폼이 없다. 그 자리를 이 화면이 대신한다 —
 * 레이아웃이 닉네임 형식을 갖추지 않은 사람을 전부 여기로 보낸다(app/layout.tsx).
 * 이미 형식을 갖춘 사람은 여기 올 이유가 없으므로 돌려보낸다.
 */
export default async function NicknamePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const back = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/nickname?next=${back}`)}`);
  if (viewer.nicknameSet) redirect(back);

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <UserRoundPen className="size-8 text-primary" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold">닉네임을 정해주세요</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        firework 의 닉네임은 소속 표기입니다. 프로젝트를 올린 사람과 일정을 적은 사람이
        누구인지 한 줄로 드러나야 하고, 같은 반끼리 서로를 찾을 수 있어야 합니다.
        그래서 <strong className="text-foreground">{NICKNAME_EXAMPLE}</strong> 형태로 통일합니다.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        나중에 <strong className="text-foreground">설정 → 프로필</strong> 에서 바꿀 수 있습니다.
        설문 응답에는 어떤 경우에도 표시되지 않습니다.
      </p>

      <div className="mt-8">
        <NicknameForm next={back} defaultValue={viewer.displayName} />
      </div>
    </div>
  );
}
