import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProjectForm } from "@/components/project/project-form";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "프로젝트 등록" };

export default async function NewProjectPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/projects/new");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">프로젝트 등록</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        실제로 써볼 수 있는 데모 주소가 있어야 합니다. 등록 직후에는 비공개 상태이고, 내용을
        다듬은 뒤 직접 공개할 수 있습니다.
      </p>

      <div className="mt-8">
        <ProjectForm mode="create" githubLogin={viewer.githubLogin} />
      </div>
    </div>
  );
}
