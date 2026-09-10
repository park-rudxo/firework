"use client";
import { useActionState } from "react";
import type { ReactNode } from "react";
import type { CommunityState } from "@/features/community/actions";
export function ActionForm({ action, children, label = "저장", className = "" }: {
  action: (state: CommunityState, form: FormData) => Promise<CommunityState>;
  children: ReactNode; label?: string; className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return <form action={formAction} className={"space-y-4 " + className}>
    <fieldset disabled={pending} className="space-y-4">
      {children}
      <button className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={pending}>{pending ? "저장 중…" : label}</button>
    </fieldset>
    {state.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
    {state.success ? <p role="status" className="text-sm text-success">{state.success}</p> : null}
  </form>;
}

