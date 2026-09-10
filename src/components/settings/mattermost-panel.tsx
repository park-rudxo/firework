"use client";

import { useActionState, useState, useTransition } from "react";
import { BadgeCheck, ExternalLink } from "lucide-react";

import {
  disconnectMattermost,
  saveWebhook,
  sendTestMessage,
  setDeliveryEnabled,
} from "@/features/mattermost/actions";

type Account = {
  username: string;
  serverUrl: string;
  verified: boolean;
  hasWebhook: boolean;
  deliveryEnabled: boolean;
  failureCount: number;
};

/**
 * Mattermost 연결 화면.
 *
 * 두 단계를 일부러 나눠 보여준다.
 *
 *  1. 계정 연결 — 싸피 Mattermost 계정이 맞는지 서버가 확인한다. 이것만으로는
 *     메시지가 오지 않는다.
 *  2. 수신 설정 — 개인 웹훅을 등록하고 스위치를 켠다.
 *
 * 인증하려고 연결했을 뿐인 사람에게 메시지가 가기 시작하면 안 되므로,
 * 1 이 2 를 자동으로 켜지 않는다.
 */
export function MattermostPanel({
  account,
  pendingCount,
  callbackUrl,
}: {
  account: Account | null;
  pendingCount: number;
  callbackUrl: string;
}) {
  if (!account) {
    return (
      <div className="mt-3 rounded-card border border-border bg-surface p-4">
        <p className="text-sm">
          Mattermost 계정을 연결하면 싸피 구성원으로 확인됩니다. 연결만으로는 어떤 메시지도 가지
          않습니다.
        </p>
        <a
          href="/api/mattermost/connect"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
        >
          <ExternalLink className="size-4" aria-hidden />
          Mattermost 계정 연결
        </a>
        <p className="mt-3 text-xs text-muted-foreground">
          연결 후 돌아올 주소: <code className="break-all">{callbackUrl}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
      <div className="rounded-card border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">@{account.username}</span>
          {account.verified ? (
            <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs text-success">
              <BadgeCheck className="size-3.5" aria-hidden />
              계정 확인됨
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{account.serverUrl}</p>
        <DisconnectButton />
      </div>

      <WebhookForm hasWebhook={account.hasWebhook} serverUrl={account.serverUrl} />

      <DeliveryToggle
        enabled={account.deliveryEnabled}
        hasWebhook={account.hasWebhook}
        failureCount={account.failureCount}
        pendingCount={pendingCount}
      />
    </div>
  );
}

function DisconnectButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await disconnectMattermost();
            setMessage(result.message);
          })
        }
        className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-surface-muted disabled:opacity-50"
      >
        연결 해제
      </button>
      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
      <p className="mt-2 text-xs text-muted-foreground">
        해제하면 저장된 웹훅 주소가 지워지고, 아직 보내지 않은 알림도 취소됩니다.
      </p>
    </div>
  );
}

function WebhookForm({ hasWebhook, serverUrl }: { hasWebhook: boolean; serverUrl: string }) {
  const [state, action, pending] = useActionState(saveWebhook, { ok: false, message: null });

  return (
    <form action={action} className="rounded-card border border-border bg-surface p-4">
      <h3 className="text-sm font-medium">개인 Incoming Webhook</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Mattermost 의 <strong>통합 → Incoming Webhook</strong> 에서 본인 이름으로 하나 만들고 그
        주소를 붙여넣어주세요. {new URL(serverUrl).host} 의 주소만 등록할 수 있습니다.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        저장할 때 암호화합니다. 공용 웹훅을 쓰면 알림이 그 주인에게 몰리므로 반드시 본인 것으로
        만들어주세요.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          name="webhookUrl"
          type="url"
          required
          placeholder={`${serverUrl.replace(/\/$/, "")}/hooks/...`}
          className="min-w-56 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {hasWebhook ? "바꾸기" : "등록"}
        </button>
      </div>

      {hasWebhook ? (
        <p className="mt-2 text-xs text-muted-foreground">등록된 웹훅이 있습니다.</p>
      ) : null}
      {state.message ? (
        <p className={`mt-2 text-sm ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function DeliveryToggle({
  enabled,
  hasWebhook,
  failureCount,
  pendingCount,
}: {
  enabled: boolean;
  hasWebhook: boolean;
  failureCount: number;
  pendingCount: number;
}) {
  const [on, setOn] = useState(enabled);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const result = await setDeliveryEnabled(next);
      setMessage(result.message);
      if (!result.ok) setOn(!next);
    });
  };

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={on} onChange={toggle} disabled={pending || !hasWebhook} className="mt-0.5" />
        <span>
          Mattermost 로 알림 받기
          <span className="block text-xs text-muted-foreground">
            이 스위치를 켜도, 프로젝트마다 알림을 켠 것만 메시지로 갑니다.
          </span>
        </span>
      </label>

      {failureCount > 0 ? (
        <p className="mt-3 text-sm text-danger">
          최근 발송이 {failureCount}회 연속 실패했습니다. 웹훅 주소를 다시 등록해주세요.
        </p>
      ) : null}

      {pendingCount > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">보내기 대기 중 {pendingCount}건</p>
      ) : null}

      {on ? <TestButton /> : null}
      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

function TestButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await sendTestMessage();
            setMessage(result.message);
          })
        }
        className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-muted disabled:opacity-50"
      >
        {pending ? "보내는 중…" : "테스트 메시지 보내기"}
      </button>
      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
