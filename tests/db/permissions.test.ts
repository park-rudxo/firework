import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  findManageableProject,
  getProjectAccess,
  managerUserIds,
} from "@/features/project/permissions";
import { listMyProjects } from "@/features/project/queries";
import { makeProject, makeUser, resetDb } from "./helpers";

/**
 * ProjectMember 에 OWNER / MAINTAINER / CONTRIBUTOR 를 만들어두고도 판정을
 * ownerId 로만 하면, 공동 관리자로 초대받은 사람이 할 수 있는 일이 하나도 없다.
 * 팀이 만든 프로젝트를 모으는 서비스에서 그건 그냥 고장이다.
 */
describe("프로젝트 권한", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let maintainer: Awaited<ReturnType<typeof makeUser>>;
  let contributor: Awaited<ReturnType<typeof makeUser>>;
  let stranger: Awaited<ReturnType<typeof makeUser>>;
  let project: Awaited<ReturnType<typeof makeProject>>;

  beforeEach(async () => {
    await resetDb();
    owner = await makeUser("16기_서울_1반_박등록");
    maintainer = await makeUser("16기_서울_1반_김공동");
    contributor = await makeUser("16기_서울_1반_이팀원");
    stranger = await makeUser("16기_서울_9반_남남");
    project = await makeProject(owner.id);

    await db.projectMember.createMany({
      data: [
        { projectId: project.id, userId: maintainer.id, role: "MAINTAINER" },
        { projectId: project.id, userId: contributor.id, role: "CONTRIBUTOR" },
      ],
    });
  });

  it("등록자는 운영과 공개를 모두 할 수 있다", async () => {
    const access = await getProjectAccess(project, owner.id);
    expect(access).toMatchObject({ isOwner: true, canManage: true, canAdminister: true });
  });

  it("공동 관리자는 운영은 하지만 공개 여부는 정하지 못한다", async () => {
    const access = await getProjectAccess(project, maintainer.id);
    expect(access).toMatchObject({ role: "MAINTAINER", canManage: true, canAdminister: false });
  });

  it("일반 팀원은 이름만 올라갈 뿐 관리 권한이 없다", async () => {
    const access = await getProjectAccess(project, contributor.id);
    expect(access).toMatchObject({ role: "CONTRIBUTOR", canManage: false, canAdminister: false });
  });

  it("남은 아무 권한도 없다", async () => {
    const access = await getProjectAccess(project, stranger.id);
    expect(access).toMatchObject({ role: null, canManage: false, canAdminister: false });
  });

  it("로그인하지 않았으면 권한 조회조차 하지 않는다", async () => {
    const access = await getProjectAccess(project, undefined);
    expect(access.canManage).toBe(false);
  });

  it("findManageableProject 는 관리 권한이 있는 사람에게만 프로젝트를 준다", async () => {
    expect(await findManageableProject(project.slug, owner.id)).not.toBeNull();
    expect(await findManageableProject(project.slug, maintainer.id)).not.toBeNull();
    expect(await findManageableProject(project.slug, contributor.id)).toBeNull();
    expect(await findManageableProject(project.slug, stranger.id)).toBeNull();
    expect(await findManageableProject(project.slug, undefined)).toBeNull();
  });

  it("제보 알림은 등록자와 공동 관리자 전원에게 간다", async () => {
    const ids = await managerUserIds(project.id);
    expect(ids.sort()).toEqual([owner.id, maintainer.id].sort());
  });

  it("내 프로젝트 목록에 팀원으로 참여한 것도 나온다", async () => {
    const mine = await listMyProjects(maintainer.id);
    expect(mine.map((p) => p.id)).toEqual([project.id]);

    const theirs = await listMyProjects(stranger.id);
    expect(theirs).toEqual([]);
  });
});
