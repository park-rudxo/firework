import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GithubLinkGate } from "@/components/auth/github-link-gate";
import { ProjectForm } from "@/components/project/project-form";
import { configuredProviders, serverEnv } from "@/lib/env";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "프로젝트 등록" };

export default async function NewProjectPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/projects/new");

  // 일반 사용자는 아무 소셜 계정으로나 쓸 수 있지만, 프로젝트를 올리려면
  // GitHub 연결이 필요하다. 저장소 소유권을 확인할 근거가 그것뿐이기 때문이다.
  // 이 화면은 안내일 뿐이고 실제 차단은 Server Action 의 requireGithubLinkedViewer 가 한다.
  if (!viewer.githubLogin) {
    const githubConfigured = configuredProviders(serverEnv()).github;
    return <GithubLinkGate githubConfigured={githubConfigured} />;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">프로젝트 등록</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GitHub 저장소 주소를 넣으면 스타·언어·README 를 자동으로 가져옵니다. 등록 직후에는
        비공개 상태이고, 내용을 다듬은 뒤 직접 공개할 수 있습니다.
      </p>

      <div className="mt-8">
        <ProjectForm mode="create" githubLogin={viewer.githubLogin} />
      </div>
    </div>
  );
}
