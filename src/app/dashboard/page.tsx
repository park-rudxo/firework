import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { ProjectIcon } from "@/components/project/project-card";
import { listMyProjects } from "@/features/project/queries";
import { CATEGORY_LABEL } from "@/features/project/schema";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "대시보드" };

const STATUS_LABEL = {
  DRAFT: "비공개",
  PUBLISHED: "공개 중",
  HIDDEN: "관리자 조치",
  REMOVED: "삭제됨",
} as const;

export default async function DashboardPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/dashboard");

  const projects = await listMyProjects(viewer.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">내 프로젝트</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            설문을 열어 피드백을 받고, 경품 추첨으로 참여를 끌어올릴 수 있습니다.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          <Plus className="size-4" aria-hidden />
          새 프로젝트
        </Link>
      </header>

      {projects.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          아직 등록한 프로젝트가 없습니다.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-4"
            >
              <ProjectIcon iconUrl={project.iconUrl} name={project.name} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/projects/${project.slug}`} className="font-medium hover:underline">
                    {project.name}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      project.status === "PUBLISHED"
                        ? "bg-success/10 text-success"
                        : project.status === "HIDDEN" || project.status === "REMOVED"
                          ? "bg-danger/10 text-danger"
                          : "bg-surface-muted text-muted-foreground"
                    }`}
                  >
                    {STATUS_LABEL[project.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {CATEGORY_LABEL[project.category]} · 구독 {project._count.follows} · 좋아요{" "}
                  {project._count.likes} · 써봄 {project._count.tries} · 제보{" "}
                  {project._count.bugReports} · 설문 {project._count.surveys}
                </p>
              </div>

              <div className="flex gap-2 text-sm">
                <Link
                  href={`/dashboard/projects/${project.slug}/feedback`}
                  className="rounded-xl border border-border px-3.5 py-2 hover:bg-surface-muted"
                >
                  피드백
                </Link>
                <Link
                  href={`/dashboard/projects/${project.slug}`}
                  className="rounded-xl border border-border px-3.5 py-2 hover:bg-surface-muted"
                >
                  운영
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
