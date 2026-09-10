"use client";

import { useActionState } from "react";
import type { BugReportStatus } from "@prisma/client";

import { BugStatusBadge } from "@/components/project/bug-report";
import { updateBugStatus } from "@/features/bug/actions";
import { BUG_STATUS_HINT, BUG_STATUS_LABEL } from "@/features/bug/schema";
import type { BugReportItem } from "@/features/bug/queries";

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });
const STATUSES: BugReportStatus[] = ["RECEIVED", "TRIAGING", "FIXED", "WONTFIX", "DUPLICATE"];

/**
 * 제보 큐.
 *
 * 처리를 기다리는 것이 위에 오고, 같은 상태 안에서는 오래된 것부터다.
 * 최신순으로 두면 먼저 제보한 사람이 계속 아래로 밀린다.
 */
export function BugQueue({ slug, reports }: { slug: string; reports: BugReportItem[] }) {
  if (reports.length === 0) {
    return (
      <p className="rounded-card border border-border bg-surface p-5 text-sm text-muted-foreground">
        아직 들어온 제보가 없습니다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {reports.map((r) => (
        <BugCard key={r.id} slug={slug} report={r} />
      ))}
    </ul>
  );
}

function BugCard({ slug, report }: { slug: string; report: BugReportItem }) {
  const [state, action, pending] = useActionState(updateBugStatus.bind(null, slug), {
    ok: false,
    message: null,
  });

  return (
    <li className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <BugStatusBadge status={report.status} />
        <h2 className="font-semibold">{report.title}</h2>
        <span className="text-xs text-muted-foreground">
          {report.reporter.profile?.displayName ?? report.reporter.name} ·{" "}
          {fmt.format(report.createdAt)}
        </span>
        {report.notifyReporter ? (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">
            처리 알림 받음
          </span>
        ) : null}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm">{report.detail}</p>

      {report.environment ? (
        <p className="mt-2 text-xs text-muted-foreground">환경 · {report.environment}</p>
      ) : null}

      <form action={action} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <input type="hidden" name="reportId" value={report.id} />

        <label className="flex flex-col gap-1.5 text-sm">
          처리 상태
          <select
            name="status"
            defaultValue={report.status}
            className="rounded-xl border border-border bg-background px-3 py-2"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} title={BUG_STATUS_HINT[s]}>
                {BUG_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm">
          제보자에게 남길 말 <span className="text-xs text-muted-foreground">(선택)</span>
          <input
            name="statusNote"
            defaultValue={report.statusNote ?? ""}
            maxLength={1000}
            placeholder="재현했습니다. 다음 배포에 포함할게요."
            className="rounded-xl border border-border bg-background px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장"}
        </button>

        {state.message ? (
          <p className={`w-full text-sm ${state.ok ? "text-success" : "text-danger"}`}>
            {state.message}
          </p>
        ) : null}
      </form>
    </li>
  );
}
