"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { setUserRole, type AdminUserState } from "@/features/admin/users";

const INITIAL: AdminUserState = { error: null, message: null };

export function RoleForm({
  userId,
  role,
  label,
  disabled,
}: {
  userId: string;
  role: "ADMIN" | "MEMBER";
  label: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(setUserRole, INITIAL);

  return (
    <form
      action={async (form) => {
        await formAction(form);
        router.refresh();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={role} />
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
      <button
        type="submit"
        disabled={pending || disabled}
        className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 ${
          role === "ADMIN" ? "border-border hover:bg-surface-muted" : "border-danger/40 text-danger"
        }`}
      >
        {pending ? "…" : label}
      </button>
    </form>
  );
}
