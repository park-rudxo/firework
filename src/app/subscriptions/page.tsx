import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { SubscriptionForm } from "@/components/community/subscription-form";
import { mattermostDeliveryConfigured } from "@/features/mattermost/config";
export const metadata = { title: "내 구독" };
export default async function SubscriptionsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/subscriptions");
  const [follows, identity] = await Promise.all([
    db.projectFollow.findMany({ where: { userId: viewer.id, project: { status: "PUBLISHED" } }, include: {
      project: { include: { updates: { orderBy: { createdAt: "desc" }, take: 1 } } },
    }, orderBy: { createdAt: "desc" } }),
    db.mattermostIdentity.findUnique({ where: { userId: viewer.id } }),
  ]);
  return <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
    <h1 className="text-2xl font-semibold">내 구독</h1>
    <p className="text-muted-foreground">관심 있는 프로젝트의 소식을 모아봅니다. 알림은 직접 켰을 때만 옵니다.</p>
    {!follows.length ? <p>아직 구독한 프로젝트가 없습니다. <Link href="/projects" className="underline">프로젝트 둘러보기 →</Link></p> : null}
    {follows.map(f => <section key={f.projectId} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <Link className="text-lg font-semibold underline" href={`/projects/${f.project.slug}/community`}>{f.project.name}</Link>
      <p className="text-sm text-muted-foreground">{f.project.updates[0]?.title ?? "아직 게시된 소식이 없습니다."}</p>
      <SubscriptionForm slug={f.project.slug} following updates={f.notifyUpdates} recruitment={f.notifyRecruitment} ready={!!identity && mattermostDeliveryConfigured()} />
    </section>)}
  </div>;
}
