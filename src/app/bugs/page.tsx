import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { BUG_STATUS_LABEL } from "@/features/community/policy";
import { ActionForm } from "@/components/community/action-form";
import { setBugNotifications } from "@/features/community/actions";
import { mattermostDeliveryConfigured } from "@/features/mattermost/config";
export const metadata = { title: "내 버그 신고" };
export default async function MyBugs() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/bugs");
  const [bugs, identity] = await Promise.all([
    db.bugReport.findMany({ where: { reporterId: viewer.id }, include: { project: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.mattermostIdentity.findUnique({ where: { userId: viewer.id } }),
  ]);
  return <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
    <h1 className="text-2xl font-semibold">내 버그 신고</h1>
    {!bugs.length ? <p>아직 제보한 버그가 없습니다. <Link href="/projects" className="underline">프로젝트 둘러보기 →</Link></p> : null}
    {bugs.map(bug => <article key={bug.id} className="space-y-3 rounded-xl border border-border p-5">
      <p className="text-sm text-muted-foreground">{bug.project.name} · {BUG_STATUS_LABEL[bug.status]}</p>
      <h2 className="font-semibold">{bug.title}</h2>
      <p className="whitespace-pre-wrap break-words text-sm">{bug.description}</p>
      {bug.resolution ? <div className="rounded-xl bg-surface-muted p-3"><h3 className="text-sm font-medium">제작자 답변</h3><p className="whitespace-pre-wrap break-words text-sm">{bug.resolution}</p></div> : null}
      <ActionForm action={setBugNotifications.bind(null, bug.id)}>
        <label className="flex items-center gap-2 text-sm"><input name="notifyStatus" type="checkbox" defaultChecked={bug.notifyStatus} disabled={!identity || !mattermostDeliveryConfigured()} /> 이 신고의 처리 알림 받기</label>
      </ActionForm>
    </article>)}
  </div>;
}
