import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GithubMark } from "@/components/icons/github-mark";
import { LinkedAccounts } from "@/components/settings/linked-accounts";
import { ProfileForm } from "@/components/settings/profile-form";
import { db } from "@/lib/db";
import { configuredProviders, serverEnv } from "@/lib/env";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "프로필 설정" };

export default async function ProfileSettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/settings/profile");

  const [profile, accounts] = await Promise.all([
    db.profile.findUnique({
      where: { userId: viewer.id },
      select: { displayName: true, bio: true, ssafyTrack: true },
    }),
    db.account.findMany({
      where: { userId: viewer.id },
      select: { providerId: true, createdAt: true },
    }),
  ]);

  const providers = configuredProviders(serverEnv());

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">프로필 설정</h1>
      <Link href="/settings/mattermost" className="mt-4 inline-block text-primary underline">싸피 Mattermost 계정 인증 · 알림 연결 →</Link>

      <section className="mt-8">
        <ProfileForm
          values={{
            displayName: profile?.displayName ?? viewer.name,
            bio: profile?.bio ?? "",
            ssafyTrack: profile?.ssafyTrack ?? "",
          }}
        />
      </section>

      <hr className="my-10 border-border" />

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <GithubMark className="size-5" />
          연결된 계정
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          GitHub 계정은 선택으로 연결할 수 있습니다. 연결한 저장소의 소유 확인에 쓰입니다.
        </p>

        <div className="mt-4">
          <LinkedAccounts
            linked={accounts.map((a) => a.providerId)}
            available={providers}
            githubLogin={viewer.githubLogin}
          />
        </div>
      </section>
    </div>
  );
}
