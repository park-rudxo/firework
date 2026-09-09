import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { ReportSeverity } from "@prisma/client";

import { ResolveForm } from "@/components/admin/resolve-form";
import { REASON_LABEL } from "@/features/report/policy";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "신고 관리" };

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });

const SEVERITY_STYLE: Record<ReportSeverity, string> = {
  CRITICAL: "bg-danger/15 text-danger",
  HIGH: "bg-accent/15 text-accent",
  NORMAL: "bg-surface-muted text-muted-foreground",
  INFO: "bg-surface-muted text-muted-foreground",
};

export default async function AdminReportsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/admin/reports");
  if (!viewer.isAdmin) redirect("/");

  // 심각도 높은 순, 같은 심각도면 오래된 순. INFO 는 제작자에게만 가므로 큐에서 뺀다.
  const reports = await db.report.findMany({
    where: { status: { in: ["OPEN", "REVIEWING"] }, severity: { not: "INFO" } },
    orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      targetType: true,
      targetId: true,
      reason: true,
      severity: true,
      detail: true,
      createdAt: true,
      reporter: { select: { name: true, email: true } },
    },
  });

  // 같은 대상에 신고가 몇 건 쌓였는지. 강조만 하고 상태는 바꾸지 않는다.
  const counts = await db.report.groupBy({
    by: ["targetType", "targetId"],
    where: { status: { in: ["OPEN", "REVIEWING"] } },
    _count: { _all: true },
  });
  const countFor = new Map(counts.map((c) => [`${c.targetType}:${c.targetId}`, c._count._all]));

  const projectIds = reports.filter((r) => r.targetType === "PROJECT").map((r) => r.targetId);
  const projects = await db.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, slug: true, name: true, status: true, repoUrl: true },
  });
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">신고 관리</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        신고 접수만으로는 아무것도 내려가지 않습니다. 자동 숨김을 두면 경쟁 프로젝트를 신고 몇
        번으로 죽일 수 있기 때문입니다. 확인하고 직접 조치해주세요.
      </p>

      {reports.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">처리할 신고가 없습니다.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {reports.map((report) => {
            const project = projectById.get(report.targetId);
            const stacked = countFor.get(`${report.targetType}:${report.targetId}`) ?? 1;

            return (
              <li key={report.id} className="rounded-card border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${SEVERITY_STYLE[report.severity]}`}
                  >
                    {report.severity}
                  </span>
                  <span className="text-sm font-medium">{REASON_LABEL[report.reason]}</span>
                  {stacked > 1 ? (
                    <span className="flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">
                      <AlertTriangle className="size-3" aria-hidden />
                      같은 대상 {stacked}건
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {fmt.format(report.createdAt)}
                  </span>
                </div>

                <div className="mt-3 text-sm">
                  {project ? (
                    <p>
                      <Link
                        href={`/projects/${project.slug}`}
                        className="font-medium text-primary underline"
                      >
                        {project.name}
                      </Link>{" "}
                      <span className="text-muted-foreground">
                        ({project.status})
                        {project.repoUrl ? (
                          <>
                            {" · "}
                            <a
                              href={project.repoUrl}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="underline"
                            >
                              저장소
                            </a>
                          </>
                        ) : null}
                      </span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      {report.targetType} · {report.targetId}
                    </p>
                  )}

                  {report.detail ? (
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-muted-foreground">
                      {report.detail}
                    </p>
                  ) : null}

                  <p className="mt-2 text-xs text-muted-foreground">
                    신고자: {report.reporter.name} ({report.reporter.email})
                  </p>
                </div>

                <div className="mt-4">
                  <ResolveForm reportId={report.id} canActOnTarget={Boolean(project)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
