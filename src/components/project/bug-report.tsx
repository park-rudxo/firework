"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Bug, ChevronDown } from "lucide-react";
import type { BugReportStatus } from "@prisma/client";

import { submitBugReport } from "@/features/bug/actions";
import { BUG_STATUS_HINT, BUG_STATUS_LABEL } from "@/features/bug/schema";

export function BugStatusBadge({ status }: { status: BugReportStatus }) {
  const tone: Record<BugReportStatus, string> = {
    RECEIVED: "bg-surface-muted text-muted-foreground",
    TRIAGING: "bg-accent/10 text-accent",
    FIXED: "bg-success/10 text-success",
    WONTFIX: "bg-surface-muted text-muted-foreground",
    DUPLICATE: "bg-surface-muted text-muted-foreground",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs ${tone[status]}`} title={BUG_STATUS_HINT[status]}>
      {BUG_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * 버그 제보 폼.
 *
 * 제작자가 설문을 열어줘야만 피드백을 낼 수 있으면, "쓰다가 깨졌다" 를 전할 방법이
 * 그동안 없다. 이건 상시 열려 있다.
 *
 * 알림 체크박스는 기본이 꺼짐이다. 제보했다는 사실이 알림 동의가 되지는 않는다.
 */
export function BugReportForm({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(submitBugReport.bind(null, slug), {
    ok: false,
    message: null,
  });

  if (!signedIn) {
    return (
      <p className="rounded-card border border-border bg-surface p-4 text-sm text-muted-foreground">
        <Link href={`/sign-in?next=/projects/${slug}`} className="text-primary underline">
          로그인
        </Link>
        하면 버그를 제보할 수 있습니다.
      </p>
    );
  }

  if (state.ok && !open) {
    return (
      <p className="rounded-card border border-success/40 bg-success/5 p-4 text-sm">
        {state.message}
      </p>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 p-4 text-left text-sm font-medium"
      >
        <Bug className="size-4 text-muted-foreground" aria-hidden />
        버그 제보하기
        <ChevronDown
          className={`ml-auto size-4 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <form action={action} className="flex flex-col gap-3 border-t border-border p-4">
          <label className="flex flex-col gap-1.5 text-sm">
            무엇이 안 되나요?
            <input
              name="title"
              required
              maxLength={120}
              placeholder="로그인 후 마이페이지가 하얗게 뜹니다"
              className="rounded-xl border border-border bg-background px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            어떤 순서로 하면 그렇게 되나요?
            <textarea
              name="detail"
              required
              rows={4}
              maxLength={4000}
              placeholder="1. 구글로 로그인 → 2. 오른쪽 위 프로필 → 3. 화면이 비어 있음"
              className="rounded-xl border border-border bg-background px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            환경 <span className="text-xs text-muted-foreground">(선택)</span>
            <input
              name="environment"
              maxLength={200}
              placeholder="크롬 141 / 윈도우 11, 또는 아이폰 사파리"
              className="rounded-xl border border-border bg-background px-3 py-2"
            />
          </label>

          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="notifyReporter" className="mt-0.5" />
            <span>
              처리 상황이 바뀌면 알려주세요
              <span className="block text-xs text-muted-foreground">
                켜지 않으면 알림은 오지 않고, 프로젝트 페이지에서 직접 확인할 수 있습니다.
              </span>
            </span>
          </label>

          {state.message ? (
            <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="self-start rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "보내는 중…" : "제보 보내기"}
          </button>

          <p className="text-xs text-muted-foreground">
            제보 내용은 제보한 본인과 이 프로젝트의 관리 팀만 볼 수 있습니다.
          </p>
        </form>
      ) : null}
    </div>
  );
}
