"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { CheckCircle2, Info } from "lucide-react";

import {
  confirmEmailVerificationCode,
  sendEmailVerificationCode,
  type VerifyState,
} from "@/features/verification/actions";

const INITIAL: VerifyState = { error: null, sent: false, verified: false };

export function VerifyEmailForm({
  email,
  back,
  deliveryConfigured,
}: {
  email: string;
  back: string;
  deliveryConfigured: boolean;
}) {
  const router = useRouter();
  const [sendState, sendAction, sending] = useActionState(sendEmailVerificationCode, INITIAL);
  const [confirmState, confirmAction, confirming] = useActionState(
    confirmEmailVerificationCode,
    INITIAL,
  );
  const [everSent, setEverSent] = useState(false);

  if (confirmState.verified) {
    return (
      <div className="rounded-card border border-success/40 bg-success/5 p-5">
        <CheckCircle2 className="size-6 text-success" aria-hidden />
        <p className="mt-3 font-medium">확인됐습니다.</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{email}</p>
        <Link
          href={back}
          onClick={() => router.refresh()}
          className="mt-5 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          돌아가기
        </Link>
      </div>
    );
  }

  const sent = everSent || sendState.sent;

  return (
    <div className="flex flex-col gap-5">
      <form action={sendAction} onSubmit={() => setEverSent(true)}>
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {sending ? "보내는 중…" : sent ? "코드 다시 보내기" : "인증 코드 보내기"}
        </button>
      </form>

      {sendState.error ? <p className="text-sm text-danger">{sendState.error}</p> : null}

      {sent && !sendState.error ? (
        <p className="text-sm text-success">코드를 보냈습니다. 메일함을 확인해주세요.</p>
      ) : null}

      {!deliveryConfigured ? (
        <p className="flex items-start gap-2 rounded-xl bg-surface-muted p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          메일 발송이 아직 설정되지 않아 <strong>코드가 서버 콘솔(터미널)에 찍힙니다.</strong>{" "}
          실제로 보내려면 <code>.env</code> 에 <code>RESEND_API_KEY</code> 를 넣으세요.
        </p>
      ) : null}

      <form action={confirmAction} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">인증 코드</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            required
            className="rounded-xl border border-border bg-surface px-3.5 py-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-primary"
          />
        </label>
        {confirmState.error ? (
          <p className="text-sm text-danger">{confirmState.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={confirming}
          className="rounded-xl border border-border px-5 py-3 text-sm font-medium disabled:opacity-60"
        >
          {confirming ? "확인 중…" : "확인"}
        </button>
      </form>

      <Link href={back} className="text-center text-sm text-muted-foreground underline">
        나중에 하기
      </Link>
    </div>
  );
}
