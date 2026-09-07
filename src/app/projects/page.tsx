import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { ProjectCard } from "@/components/project/project-card";
import { listProjects, popularTags, type ProjectSort } from "@/features/project/queries";
import { CATEGORIES, CATEGORY_LABEL } from "@/features/project/schema";
import type { ProjectCategory } from "@prisma/client";

export const metadata: Metadata = { title: "둘러보기" };

const SORTS: { value: ProjectSort; label: string }[] = [
  { value: "recent", label: "최신순" },
  { value: "popular", label: "인기순" },
  { value: "updated", label: "최근 업데이트" },
  { value: "stars", label: "스타순" },
];

type SearchParams = {
  q?: string;
  category?: string;
  tag?: string;
  sort?: string;
  page?: string;
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const category = CATEGORIES.includes(sp.category as (typeof CATEGORIES)[number])
    ? (sp.category as ProjectCategory)
    : undefined;
  const sort = SORTS.some((s) => s.value === sp.sort) ? (sp.sort as ProjectSort) : "recent";
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ items, total, pageCount }, tags] = await Promise.all([
    listProjects({ q: sp.q?.trim() || undefined, category, tag: sp.tag, sort, page }),
    popularTags(16),
  ]);

  const buildHref = (patch: Partial<SearchParams>) => {
    const next = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v && k !== "page") next.set(k, String(v));
    }
    if (patch.page && Number(patch.page) > 1) next.set("page", String(patch.page));
    const qs = next.toString();
    return qs ? `/projects?${qs}` : "/projects";
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">둘러보기</h1>
          <p className="mt-1 text-sm text-muted-foreground">공개된 프로젝트 {total}개</p>
        </div>

        <form action="/projects" className="relative">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          {sp.tag ? <input type="hidden" name="tag" value={sp.tag} /> : null}
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="프로젝트 검색"
            aria-label="프로젝트 검색"
            className="w-64 rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </form>
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        <FilterChip href={buildHref({ category: undefined })} active={!category}>
          전체
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c} href={buildHref({ category: c })} active={category === c}>
            {CATEGORY_LABEL[c]}
          </FilterChip>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">정렬</span>
        {SORTS.map((s) => (
          <Link
            key={s.value}
            href={buildHref({ sort: s.value })}
            className={
              sort === s.value
                ? "font-medium text-foreground underline underline-offset-4"
                : "text-muted-foreground hover:text-foreground"
            }
          >
            {s.label}
          </Link>
        ))}
      </div>

      {sp.tag ? (
        <p className="mt-4 text-sm">
          <span className="rounded-full bg-surface-muted px-2.5 py-1">#{sp.tag}</span>{" "}
          <Link href={buildHref({ tag: undefined })} className="text-muted-foreground underline">
            태그 해제
          </Link>
        </p>
      ) : tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map(({ tag, count }) => (
            <Link
              key={tag}
              href={buildHref({ tag })}
              className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              #{tag} <span className="opacity-60">{count}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          조건에 맞는 프로젝트가 없습니다.{" "}
          <Link href="/projects/new" className="text-primary underline">
            첫 프로젝트를 등록해보세요
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav className="mt-10 flex justify-center gap-2 text-sm" aria-label="페이지">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={buildHref({ page: String(n) })}
              aria-current={n === page ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 ${
                n === page
                  ? "bg-primary text-primary-foreground"
                  : "border border-border hover:bg-surface-muted"
              }`}
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "bg-foreground text-background"
          : "border border-border text-muted-foreground hover:bg-surface-muted"
      }`}
    >
      {children}
    </Link>
  );
}
