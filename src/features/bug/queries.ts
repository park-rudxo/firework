import "server-only";

import type { BugReportStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { getProjectAccess } from "@/features/project/permissions";
import { OPEN_BUG_STATUSES } from "@/features/bug/schema";

/**
 * 제보 목록·상세는 전부 이 파일을 지난다.
 *
 * 본문에는 재현 경로와 계정 상태가 섞이기 쉽다("로그인하고 마이페이지 들어가면"),
 * 그래서 **본문은 제보자와 프로젝트 관리 팀만** 본다. 공개 화면에는 건수와 상태만 낸다.
 */

export const bugReportSelect = {
  id: true,
  title: true,
  detail: true,
  environment: true,
  status: true,
  statusNote: true,
  notifyReporter: true,
  createdAt: true,
  updatedAt: true,
  handledAt: true,
  reporter: {
    select: { id: true, name: true, profile: { select: { displayName: true } } },
  },
} as const;

export type BugReportItem = Awaited<ReturnType<typeof listProjectBugReports>>[number];

/** 관리 팀용 전체 목록. 권한은 호출부에서 확인한 뒤 부른다. */
export async function listProjectBugReports(projectId: string, status?: BugReportStatus[]) {
  return db.bugReport.findMany({
    where: { projectId, ...(status?.length ? { status: { in: status } } : {}) },
    // 처리를 기다리는 것이 위로 오게 한다. 같은 상태 안에서는 오래된 것부터다 —
    // 최신순으로 두면 먼저 제보한 사람이 계속 아래로 밀린다.
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: bugReportSelect,
  });
}

/** 이 프로젝트에 내가 낸 제보. 제보자가 처리 상황을 확인하는 곳이다. */
export async function listMyBugReports(projectId: string, viewerId: string | undefined) {
  if (!viewerId) return [];
  return db.bugReport.findMany({
    where: { projectId, reporterId: viewerId },
    orderBy: { createdAt: "desc" },
    select: bugReportSelect,
  });
}

/** 공개 화면에 낼 요약. 본문은 들어가지 않는다. */
export async function bugReportSummary(projectId: string) {
  const rows = await db.bugReport.groupBy({
    by: ["status"],
    where: { projectId },
    _count: { _all: true },
  });

  const counts = Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<
    Record<BugReportStatus, number>
  >;

  const open = OPEN_BUG_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const fixed = counts.FIXED ?? 0;
  return { open, fixed, total: rows.reduce((sum, r) => sum + r._count._all, 0) };
}

/**
 * 한 건을 본다. 제보자 본인이거나 관리 팀이어야 한다.
 * 권한이 없으면 "없다" 로 답한다 — 존재 여부만 알려주는 것도 정보다.
 */
export async function getBugReportForViewer(id: string, viewerId: string | undefined) {
  if (!viewerId) return null;

  const report = await db.bugReport.findUnique({
    where: { id },
    select: {
      ...bugReportSelect,
      reporterId: true,
      project: { select: { id: true, slug: true, name: true, ownerId: true } },
    },
  });
  if (!report) return null;

  if (report.reporterId === viewerId) return report;

  const access = await getProjectAccess(report.project, viewerId);
  return access.canManage ? report : null;
}
