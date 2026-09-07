"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { resolveReport, type AdminState } from "@/features/report/admin";

const INITIAL: AdminState = { error: null };

export function ResolveForm({
  reportId,
  canActOnTarget,
}: {
  reportId: string;
  canActOnTarget: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(resolveReport, INITIAL);

  return (
    <form
      action={async (form) => {
        await formAction(form);
        router.refresh();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="reportId" value={reportId} />

      <input
        name="note"
        placeholder="처리 메모 (선택) — 제작자에게 전달할 사유"
        className="rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="action"
          value="REJECT"
          disabled={pending}
          className="rounded-xl border border-border px-3.5 py-2 text-sm disabled:opacity-60"
        >
          반려 (문제 없음)
        </button>
        <button
          type="submit"
          name="action"
          value="HIDE"
          disabled={pending || !canActOnTarget}
          className="rounded-xl border border-accent/50 bg-accent/10 px-3.5 py-2 text-sm text-accent disabled:opacity-60"
        >
          숨김 (되돌릴 수 있음)
        </button>
        <button
          type="submit"
          name="action"
          value="REMOVE"
          disabled={pending || !canActOnTarget}
          className="rounded-xl bg-danger px-3.5 py-2 text-sm text-white disabled:opacity-60"
        >
          삭제
        </button>
      </div>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}
