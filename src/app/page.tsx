import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ProjectCard } from "@/components/project/project-card";
import { homeSections } from "@/features/curation/sections";
import { CATEGORIES, CATEGORY_LABEL } from "@/features/project/schema";

export default async function HomePage() {
  const sections = await homeSections();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <section className="rounded-card border border-border bg-surface px-6 py-12 text-center sm:px-10">
        <h1 className="text-balance text-3xl font-semibold sm:text-4xl">
          SSAFY 프로젝트, 한곳에서.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
          만든 걸 올리고, 남이 만든 걸 직접 써보고, 솔직한 피드백을 익명으로 남기세요.
          설문을 쓰면 제작자가 건 경품 추첨에 응모됩니다.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          <Link
            href="/projects"
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            둘러보기
          </Link>
          <Link
            href="/projects/new"
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface-muted"
          >
            내 프로젝트 올리기
          </Link>
        </div>
      </section>

      <nav className="rail mt-8 flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            href={`/projects?category=${c}`}
            className="shrink-0 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            {CATEGORY_LABEL[c]}
          </Link>
        ))}
      </nav>

      {sections.length === 0 ? (
        <p className="mt-20 text-center text-muted-foreground">
          아직 공개된 프로젝트가 없습니다.{" "}
          <Link href="/projects/new" className="text-primary underline">
            첫 프로젝트의 주인공이 되어보세요
          </Link>
          .
        </p>
      ) : (
        sections.map((section) => (
          <section key={section.key} className="mt-12">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{section.title}</h2>
                {section.subtitle ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{section.subtitle}</p>
                ) : null}
              </div>
              <Link
                href={section.href}
                className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                더 보기
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>

            {/* 플레이스토어처럼 가로로 흐르는 카드 레일. 좁은 화면에서는 스와이프가 자연스럽다. */}
            <ul className="rail mt-4 flex gap-4 overflow-x-auto pb-2">
              {section.items.map((project) => (
                <li key={project.id} className="w-64 shrink-0">
                  <ProjectCard project={project} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
