import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { bugReportSummary, getBugReportForViewer, listMyBugReports } from "@/features/bug/queries";
import { makeProject, makeUser, resetDb } from "./helpers";

/**
 * 제보 본문에는 재현 경로와 계정 상태가 섞이기 쉽다("로그인하고 마이페이지 들어가면").
 * 그래서 본문은 제보자와 프로젝트 관리 팀만 본다. 공개 화면에는 건수와 상태만 낸다.
 */
describe("버그 제보 열람 권한", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let maintainer: Awaited<ReturnType<typeof makeUser>>;
  let reporter: Awaited<ReturnType<typeof makeUser>>;
  let stranger: Awaited<ReturnType<typeof makeUser>>;
  let project: Awaited<ReturnType<typeof makeProject>>;
  let reportId: string;

  beforeEach(async () => {
    await resetDb();
    owner = await makeUser("16기_서울_1반_박등록");
    maintainer = await makeUser("16기_서울_1반_김공동");
    reporter = await makeUser("16기_서울_2반_이제보");
    stranger = await makeUser("16기_서울_9반_남남");
    project = await makeProject(owner.id);

    await db.projectMember.create({
      data: { projectId: project.id, userId: maintainer.id, role: "MAINTAINER" },
    });

    const report = await db.bugReport.create({
      data: {
        projectId: project.id,
        reporterId: reporter.id,
        title: "화면이 멈추는 문제",
        detail: "로그인하고 마이페이지에 들어가면 비어 있습니다.",
      },
      select: { id: true },
    });
    reportId = report.id;
  });

  it("제보자 본인은 볼 수 있다", async () => {
    expect(await getBugReportForViewer(reportId, reporter.id)).not.toBeNull();
  });

  it("관리 팀은 볼 수 있다", async () => {
    expect(await getBugReportForViewer(reportId, owner.id)).not.toBeNull();
    expect(await getBugReportForViewer(reportId, maintainer.id)).not.toBeNull();
  });

  it("남은 볼 수 없다", async () => {
    // "권한이 없다" 가 아니라 "없다" 로 답한다. 존재 여부만 알려주는 것도 정보다.
    expect(await getBugReportForViewer(reportId, stranger.id)).toBeNull();
    expect(await getBugReportForViewer(reportId, undefined)).toBeNull();
  });

  it("내가 낸 제보만 내 목록에 나온다", async () => {
    const mine = await listMyBugReports(project.id, reporter.id);
    expect(mine.map((r) => r.id)).toEqual([reportId]);
    expect(await listMyBugReports(project.id, stranger.id)).toEqual([]);
  });

  it("공개 요약에는 건수만 담긴다", async () => {
    await db.bugReport.create({
      data: {
        projectId: project.id,
        reporterId: stranger.id,
        title: "두 번째",
        detail: "상세",
        status: "FIXED",
      },
    });

    const summary = await bugReportSummary(project.id);
    expect(summary).toEqual({ open: 1, fixed: 1, total: 2 });
    expect(Object.keys(summary)).toEqual(["open", "fixed", "total"]);
  });

  it("알림 수신은 기본이 꺼짐이다", async () => {
    const report = await db.bugReport.findUniqueOrThrow({
      where: { id: reportId },
      select: { notifyReporter: true },
    });
    expect(report.notifyReporter).toBe(false);
  });
});
