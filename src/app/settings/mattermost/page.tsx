import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { connectMattermost, disconnectMattermost } from "@/features/mattermost/actions";
import { mattermostOAuthConfigured, mattermostDeliveryConfigured } from "@/features/mattermost/config";
export const metadata = { title: "Mattermost 연결" };
const messages: Record<string, string> = {
  connected: "싸피 Mattermost 계정 인증을 완료했습니다. 알림은 자동으로 켜지지 않습니다.",
  disconnected: "연결을 해제하고 모든 Mattermost 알림을 껐습니다.",
  unavailable: "Mattermost 계정 연결을 준비 중입니다.",
  invalid: "인증 요청이 만료되었거나 일치하지 않습니다. 다시 연결해주세요.",
  cancelled: "인증을 취소했습니다.",
  failed: "계정을 연결하지 못했습니다. 이미 다른 계정에 연결되어 있거나 서버 설정을 확인해야 할 수 있습니다.",
  "disconnect-first": "다른 Mattermost 계정을 사용하려면 기존 연결을 먼저 해제해주세요.",
};
export default async function MattermostSettings({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/settings/mattermost");
  const identity = await db.mattermostIdentity.findUnique({ where: { userId: viewer.id } });
  const { result } = await searchParams;
  return <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
    <Link href="/settings/profile" className="text-sm underline">← 프로필 설정</Link>
    <h1 className="text-2xl font-semibold">Mattermost 연결</h1>
    <p>싸피 Mattermost 계정으로 구성원 인증을 합니다. 인증과 소식 수신 동의는 별개입니다.</p>
    {result && messages[result] ? <p role="status" className="rounded-xl border border-border p-4">{messages[result]}</p> : null}
    <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold">싸피 구성원 인증</h2>
      {identity ? <>
        <p>인증 완료 · @{identity.username}</p>
        <form action={disconnectMattermost}><button className="rounded-xl border border-border px-4 py-2">연결 해제 및 알림 모두 끄기</button></form>
      </> : mattermostOAuthConfigured() ? <form action={connectMattermost}>
        <button className="rounded-xl bg-primary px-4 py-2 text-primary-foreground">Mattermost로 인증하기</button>
      </form> : <p className="text-sm text-muted-foreground">계정 인증 연결을 준비 중입니다. 현재는 프로젝트 구독과 사이트 내 기능을 이용할 수 있습니다.</p>}
    </section>
    <section className="space-y-3">
      <h2 className="font-semibold">알림은 직접 선택한 경우에만</h2>
      <p className="text-sm text-muted-foreground">{mattermostDeliveryConfigured() ? "프로젝트별로 원하는 소식을 선택하세요." : "Mattermost 메시지 발송은 준비 중입니다. 설정이 완료되기 전에는 발송되지 않습니다."}</p>
      <Link href="/subscriptions" className="text-primary underline">내 구독과 알림 설정 →</Link>
    </section>
  </div>;
}

