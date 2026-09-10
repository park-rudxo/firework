"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";

import { BugStatusBadge } from "@/components/project/bug-report";
import { setBugNotify } from "@/features/bug/actions";
import type { BugReportItem } from "@/features/bug/queries";

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

/**
 * 내가 낸 제보와 그 처리 상황.
 *
 * 제보하고 나면 어떻게 됐는지 알 길이 없는 것이 제보를 그만두게 만드는 가장 큰
 * 이유다. 알림을 켜지 않아도 여기서는 항상 볼 수 있게 한다.
 */
export function MyBugReports({ reports }: { reports: BugReportItem[] }) {
  if (reports.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-muted-foreground">내가 보낸 제보</h3>
      <ul className="mt-3 flex flex-col gap-2">
        {reports.map((r) => (
          <BugRow key={r.id} report={r} />
        ))}
      </ul>
    </div>
  );
}

function BugRow({ report }: { report: BugReportItem }) {
  const [notify, setNotify] = useState(report.notifyReporter);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !notify;
    setNotify(next);
    startTransition(async () => {
      try {
        await setBugNotify(report.id, next);
      } catch {
        setNotify(!next);
      }
    });
  };

  return (
    <li id={`bug-${report.id}`} className="rounded-card border border-border bg-surface p-3.5 scroll-mt-20">
      <div className="flex flex-wrap items-center gap-2">
        <BugStatusBadge status={report.status} />
        <span className="text-sm font-medium">{report.title}</span>
        <time className="text-xs text-muted-foreground" dateTime={report.createdAt.toISOString()}>
          {fmt.format(report.createdAt)}
        </time>

        <button
          type="button"
          onClick={toggle}
          aria-pressed={notify}
          title={notify ? "처리 알림 끄기" : "처리 알림 받기"}
          className={`ml-auto flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition ${
            notify
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-surface-muted"
          }`}
        >
          {notify ? <Bell className="size-3.5" aria-hidden /> : <BellOff className="size-3.5" aria-hidden />}
          {notify ? "알림 켜짐" : "알림 꺼짐"}
        </button>
      </div>

      {report.statusNote ? (
        <p className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">팀 답변 · </span>
          {report.statusNote}
        </p>
      ) : null}
    </li>
  );
}
