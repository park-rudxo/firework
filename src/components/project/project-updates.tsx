import { UntrustedHtml } from "@/components/project/untrusted-html";
import { renderMarkdown } from "@/lib/sanitize";
import { UPDATE_KIND_LABEL } from "@/features/update/schema";
import type { ProjectUpdateItem } from "@/features/update/queries";

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

/**
 * 진행 소식 타임라인.
 *
 * 배포 주소가 죽어도 여기 적힌 것은 남는다. 무엇을 만들었고 어떻게 고쳐왔는지가
 * 프로젝트에 남아야 다음 기수가 찾아볼 것이 생긴다.
 */
export async function ProjectUpdates({ updates }: { updates: ProjectUpdateItem[] }) {
  if (updates.length === 0) return null;

  // 소식 본문은 제작자가 쓴 마크다운이다. 로그인한 사람 누구나 프로젝트를 만들 수
  // 있으므로 남이 쓴 것으로 보고 렌더 직전에 정화한다.
  const rendered = await Promise.all(
    updates.map(async (u) => ({ ...u, html: await renderMarkdown(u.body) })),
  );

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">진행 소식</h2>
      <ol className="mt-4 flex flex-col gap-4">
        {rendered.map((u) => (
          <li
            key={u.id}
            id={`update-${u.id}`}
            className="rounded-card border border-border bg-surface p-4 scroll-mt-20"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-surface-muted px-2.5 py-1">
                {UPDATE_KIND_LABEL[u.kind]}
              </span>
              <time dateTime={u.publishedAt.toISOString()}>{fmt.format(u.publishedAt)}</time>
              {u.author ? <span>· {u.author.profile?.displayName ?? u.author.name}</span> : null}
              {u.fixedBugReportIds.length > 0 ? (
                <span className="text-success">
                  · 제보 {u.fixedBugReportIds.length}건 반영
                </span>
              ) : null}
            </div>

            <h3 className="mt-2 font-semibold">{u.title}</h3>
            <UntrustedHtml html={u.html} className="mt-2 text-sm" />
          </li>
        ))}
      </ol>
    </section>
  );
}
