import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectForm } from "@/components/project/project-form";
import { PublishToggle } from "@/components/project/publish-toggle";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "프로젝트 관리" };

export default async function EditProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { slug } = await params;
  const { created } = await searchParams;

  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=/projects/${slug}/edit`);

  const project = await db.project.findUnique({
    where: { slug },
    select: {
      name: true,
      tagline: true,
      description: true,
      category: true,
      tags: true,
      repoUrl: true,
      demoUrl: true,
      iconUrl: true,
      screenshots: true,
      status: true,
      ownerId: true,
      ownershipVerified: true,
    },
  });

  if (!project || project.status === "REMOVED") notFound();
  if (project.ownerId !== viewer.id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">프로젝트 관리</h1>
        <Link href={`/projects/${slug}`} className="text-sm text-muted-foreground underline">
          공개 화면 보기
        </Link>
      </div>

      {created ? (
        <p className="mt-4 rounded-xl border border-success/40 bg-success/5 p-3.5 text-sm">
          등록됐습니다.{project.repoUrl ? " GitHub 정보도 가져왔어요." : ""} 내용을 다듬고{" "}
          <strong>공개</strong>를 눌러주세요.
        </p>
      ) : null}

      {project.status === "HIDDEN" ? (
        <p className="mt-4 rounded-xl border border-danger/40 bg-danger/5 p-3.5 text-sm text-danger">
          신고 검토 결과 관리자가 이 프로젝트를 숨김 처리했습니다. 이의가 있다면 문의해주세요.
        </p>
      ) : null}

      {project.repoUrl && !project.ownershipVerified ? (
        <p className="mt-4 rounded-xl border border-border bg-surface-muted p-3.5 text-sm text-muted-foreground">
          연결된 GitHub 계정이 이 저장소의 소유자나 협업자로 확인되지 않아 <strong>소유 미확인</strong>
          으로 표시됩니다. 조직 저장소인 경우에도 이렇게 나올 수 있습니다.
        </p>
      ) : null}

      <div className="mt-6">
        <PublishToggle slug={slug} status={project.status} />
      </div>

      <hr className="my-8 border-border" />

      <ProjectForm
        mode="edit"
        slug={slug}
        githubLogin={viewer.githubLogin}
        values={{
          name: project.name,
          tagline: project.tagline,
          description: project.description,
          category: project.category,
          tags: project.tags,
          repoUrl: project.repoUrl,
          demoUrl: project.demoUrl,
          iconUrl: project.iconUrl,
          screenshots: project.screenshots,
        }}
      />
    </div>
  );
}
