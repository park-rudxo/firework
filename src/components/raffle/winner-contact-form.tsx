"use client";

import { useActionState } from "react";

import { submitWinnerContact, type RaffleState } from "@/features/raffle/actions";

const INITIAL: RaffleState = { error: null };

export function WinnerContactForm({ winnerId }: { winnerId: string }) {
  const [state, formAction, pending] = useActionState(
    submitWinnerContact.bind(null, winnerId),
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          name="contactInfo"
          required
          placeholder="카카오 오픈채팅 링크 또는 이메일"
          className="min-w-56 flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? "제출 중…" : "제출"}
        </button>
      </div>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}
