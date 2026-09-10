import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, BellOff } from "lucide-react";

import { ProjectIcon } from "@/components/project/project-card";
import { listMySubscriptions, TOPIC_LABEL } from "@/features/subscription/queries";
import { listUpdatesForSubscriber } from "@/features/update/queries";
import { UPDATE_KIND_LABEL } from "@/features/update/schema";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "구독" };

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

/**
 * 내가 구독한 프로젝트와 그 소식.
 *
 * 알림을 하나도 켜지 않아도 여기 들어오면 밀린 소식을 볼 수 있어야 한다.
 * 그래야 "알림은 싫지만 가끔 확인은 하고 싶다" 가 성립한다.
 */
export default async function SubscriptionsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/subscriptions");

  const [subscriptions, updates] = await Promise.all([
    listMySubscriptions(viewer.id),
    listUpdatesForSubscriber(viewer.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">구독</h1>
        <Link href="/settings/notifications" className="text-sm text-muted-foreground underline">
          알림 설정
        </Link>
      </div>

      {subscriptions.length === 0 ? (
        <p className="mt-6 rounded-card border border-border bg-surface p-5 text-sm text-muted-foreground">
          아직 구독한 프로젝트가 없습니다.{" "}
          <Link href="/projects" className="text-primary underline">
            프로젝트 둘러보기
          </Link>
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {subscriptions.map((s) => (
            <li
              key={s.project.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3.5"
            >
              <ProjectIcon iconUrl={s.project.iconUrl} name={s.project.name} />
              <div className="min-w-0 flex-1">
                <Link href={`/projects/${s.project.slug}`} className="font-medium hover:underline">
                  {s.project.name}
                </Link>
                <p className="truncate text-sm text-muted-foreground">{s.project.tagline}</p>
              </div>

              {s.topics.length > 0 ? (
                <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                  <Bell className="size-3.5" aria-hidden />
                  {s.topics.map((t) => TOPIC_LABEL[t]).join(" · ")}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted-foreground">
                  <BellOff className="size-3.5" aria-hidden />
                  알림 꺼짐
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {updates.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">구독한 프로젝트의 소식</h2>
          <ol className="mt-4 flex flex-col gap-2">
            {updates.map((u) => (
              <li key={u.id} className="rounded-card border border-border bg-surface p-3.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-surface-muted px-2 py-0.5">
                    {UPDATE_KIND_LABEL[u.kind]}
                  </span>
                  <Link href={`/projects/${u.project.slug}`} className="hover:underline">
                    {u.project.name}
                  </Link>
                  <time dateTime={u.publishedAt.toISOString()}>{fmt.format(u.publishedAt)}</time>
                </div>
                <Link
                  href={`/projects/${u.project.slug}#update-${u.id}`}
                  className="mt-1.5 block text-sm font-medium hover:underline"
                >
                  {u.title}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
