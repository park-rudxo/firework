import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MattermostPanel } from "@/components/settings/mattermost-panel";
import { redirectUri } from "@/features/mattermost/oauth";
import { db } from "@/lib/db";
import { mattermostConfigured, serverEnv } from "@/lib/env";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "알림 설정" };

const ERROR_MESSAGE: Record<string, string> = {
  unconfigured: "이 사이트에 Mattermost 연동이 아직 설정되지 않았습니다.",
  state: "요청이 만료되었습니다. 다시 시도해주세요.",
  denied: "Mattermost 에서 연결을 취소했습니다.",
  verify: "Mattermost 계정을 확인하지 못했습니다.",
  taken: "이 Mattermost 계정은 이미 다른 firework 계정에 연결되어 있습니다.",
};

export default async function NotificationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;

  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/settings/notifications");

  const env = serverEnv();
  const configured = mattermostConfigured(env);

  const [account, prefCount, pending] = await Promise.all([
    db.mattermostAccount.findUnique({
      where: { userId: viewer.id },
      select: {
        username: true,
        serverUrl: true,
        verifiedAt: true,
        webhookUrlEnc: true,
        deliveryEnabled: true,
        failureCount: true,
      },
    }),
    db.projectNotificationPref.count({ where: { userId: viewer.id } }),
    db.outboundMessage.count({ where: { userId: viewer.id, status: "PENDING" } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">알림</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        알림은 프로젝트마다 따로 켭니다. 구독만 해서는 어떤 메시지도 나가지 않습니다.
      </p>

      {connected ? (
        <p className="mt-4 rounded-xl border border-success/40 bg-success/5 p-3.5 text-sm">
          Mattermost 계정을 연결했습니다. <strong>알림은 아직 꺼져 있습니다</strong> — 아래에서
          웹훅을 등록하고 켜주세요.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl border border-danger/40 bg-danger/5 p-3.5 text-sm text-danger">
          {ERROR_MESSAGE[error] ?? "연결하지 못했습니다."}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">사이트 알림</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          구독한 프로젝트의 소식은 항상{" "}
          <Link href="/notifications" className="text-primary underline">
            알림함
          </Link>
          에 쌓입니다. 이건 밖으로 나가지 않으므로 끄고 켜는 설정이 없습니다.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          지금 <strong>{prefCount}건</strong>의 프로젝트 알림을 켜두셨습니다.{" "}
          <Link href="/subscriptions" className="text-primary underline">
            구독 목록에서 관리
          </Link>
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Mattermost</h2>

        {!configured ? (
          <p className="mt-3 rounded-card border border-border bg-surface p-4 text-sm text-muted-foreground">
            이 사이트에는 아직 Mattermost 연동이 설정되지 않았습니다. 설정되기 전까지 계정 연결과
            메시지 발송은 동작하지 않으며, 연결된 것처럼 표시하지도 않습니다.
          </p>
        ) : (
          <MattermostPanel
            account={
              account
                ? {
                    username: account.username,
                    serverUrl: account.serverUrl,
                    verified: Boolean(account.verifiedAt),
                    hasWebhook: Boolean(account.webhookUrlEnc),
                    deliveryEnabled: account.deliveryEnabled,
                    failureCount: account.failureCount,
                  }
                : null
            }
            pendingCount={pending}
            callbackUrl={redirectUri(env)}
          />
        )}
      </section>
    </div>
  );
}
