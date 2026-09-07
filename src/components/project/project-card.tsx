import Link from "next/link";
import { BadgeCheck, Heart, Star } from "lucide-react";

import { CATEGORY_LABEL } from "@/features/project/schema";
import type { ProjectCard as ProjectCardData } from "@/features/project/queries";

export function ProjectCard({ project }: { project: ProjectCardData }) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group flex h-full flex-col rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex items-start gap-3">
        <ProjectIcon iconUrl={project.iconUrl} name={project.name} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-medium">{project.name}</h3>
            {project.ownershipVerified ? (
              <BadgeCheck className="size-4 shrink-0 text-success" aria-label="저장소 소유 확인됨" />
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {CATEGORY_LABEL[project.category]}
            {project.snapshot?.primaryLanguage ? ` · ${project.snapshot.primaryLanguage}` : ""}
          </p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 flex-1 text-sm text-muted-foreground">{project.tagline}</p>

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Heart className="size-3.5" aria-hidden />
          {project._count.likes}
        </span>
        {project.snapshot?.stars ? (
          <span className="flex items-center gap-1">
            <Star className="size-3.5" aria-hidden />
            {project.snapshot.stars}
          </span>
        ) : null}
        {project._count.tries > 0 ? <span>{project._count.tries}명이 써봄</span> : null}
      </div>
    </Link>
  );
}

export function ProjectIcon({
  iconUrl,
  name,
  size = "md",
}: {
  iconUrl: string | null;
  name: string;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "size-20 rounded-2xl text-2xl" : "size-11 rounded-xl text-base";

  if (iconUrl) {
    return (
      // 사용자가 넣은 임의 호스트의 이미지라 next/image 최적화 대상에서 뺀다.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt=""
        loading="lazy"
        className={`${box} shrink-0 border border-border object-cover`}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`${box} flex shrink-0 items-center justify-center bg-surface-muted font-semibold text-muted-foreground`}
    >
      {name.slice(0, 1)}
    </div>
  );
}
