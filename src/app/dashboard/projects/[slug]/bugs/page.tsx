import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BugQueue } from "@/components/dashboard/bug-queue";
import { listProjectBugReports } from "@/features/bug/queries";
import { findManageableProject } from "@/features/project/permissions";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "버그 제보" };

export default async function ProjectBugsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const viewer = await getViewer();
  if (!viewer) {
    redirect(`/sign-in?next=${encodeURIComponent(`/dashboard/projects/${slug}/bugs`)}`);
  }

  const project = await findManageableProject(slug, viewer.id);
  if (!project) notFound();

  const reports = await listProjectBugReports(project.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href={`/dashboard/projects/${slug}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {project.name} 운영
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">버그 제보</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        제보 내용은 제보한 사람과 이 프로젝트의 관리 팀만 볼 수 있습니다. 상태를 바꾸면 제보자가
        프로젝트 페이지에서 진행을 확인할 수 있고, 제보자가 알림을 켜둔 경우에만 메시지가 갑니다.
      </p>

      <div className="mt-6">
        <BugQueue slug={slug} reports={reports} />
      </div>
    </div>
  );
}
