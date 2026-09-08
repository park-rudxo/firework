import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GithubLinkNotice } from "@/components/auth/github-link-notice";
import { ProjectForm } from "@/components/project/project-form";
import { configuredProviders, serverEnv } from "@/lib/env";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "프로젝트 등록" };

export default async function NewProjectPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/projects/new");

  // GitHub 연결은 저장소를 붙일 때만 필요하다. 배포된 웹서비스나 스토어 앱처럼
  // 저장소가 없는 프로젝트도 같은 자리에 서야 하므로, 여기서 막지 않는다.
  // 실제 차단은 Server Action 이 저장소 주소가 들어온 경우에만 한다.
  const githubConfigured = configuredProviders(serverEnv()).github;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">프로젝트 등록</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        배포한 웹서비스, 스토어에 올린 앱, GitHub 저장소 — 형태는 상관없습니다. 써볼 수 있는 주소
        하나만 있으면 됩니다. GitHub 저장소를 넣으면 스타·언어·README 를 자동으로 가져옵니다.
        등록 직후에는 비공개 상태이고, 내용을 다듬은 뒤 직접 공개할 수 있습니다.
      </p>

      {!viewer.githubLogin ? (
        <div className="mt-6">
          <GithubLinkNotice githubConfigured={githubConfigured} />
        </div>
      ) : null}

      <div className="mt-8">
        <ProjectForm mode="create" githubLogin={viewer.githubLogin} />
      </div>
    </div>
  );
}
