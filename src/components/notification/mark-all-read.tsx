"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { markAllNotificationsRead } from "@/features/notification/actions";

export function MarkAllRead() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markAllNotificationsRead();
          router.refresh();
        })
      }
      className="rounded-xl border border-border px-3.5 py-2 text-sm text-muted-foreground hover:bg-surface-muted disabled:opacity-60"
    >
      {pending ? "처리 중…" : "모두 읽음"}
    </button>
  );
}
