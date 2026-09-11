import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 팀 초대가 지키는 약속 하나: **초대만으로는 아무 권한도 생기지 않는다.**
 *
 * 초대하는 쪽이 남의 계정을 남의 프로젝트에 밀어 넣을 수 있으면 초대는 권한이 아니라
 * 스팸이 된다. 그래서 대기 중인 초대는 멤버십을 만들지 않고, 본인이 승인해야 한다.
 */
const mocks = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  });
  return {
    db: {
      projectInvitation: model(),
      projectMember: model(),
      mattermostIdentity: model(),
      notification: model(),
      mattermostDelivery: model(),
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
    },
    viewer: vi.fn(),
    access: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/session", () => ({ requireViewer: mocks.viewer }));
vi.mock("@/features/community/access", () => ({
  projectAccess: mocks.access,
  CommunityError: class extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  cancelInvitation,
  changeMemberRole,
  inviteMember,
  removeMember,
  respondToInvitation,
} from "@/features/team/actions";

const form = (data: Record<string, string>) => {
  const f = new FormData();
  Object.entries(data).forEach(([k, v]) => f.set(k, v));
  return f;
};

const OWNER = { project: { id: "project", ownerId: "owner", name: "모아모아", status: "PUBLISHED" }, owner: true };
const NOT_OWNER = { ...OWNER, owner: false };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.$transaction.mockImplementation((fn) => fn(mocks.db));
  mocks.viewer.mockResolvedValue({ id: "owner" });
  mocks.access.mockResolvedValue(OWNER);
  mocks.db.mattermostIdentity.findUnique.mockResolvedValue({
    mattermostUserId: "mm-kim",
    userId: "kim",
  });
  mocks.db.projectMember.findUnique.mockResolvedValue(null);
  mocks.db.projectInvitation.create.mockResolvedValue({ id: "invite-1" });
});

describe("초대 보내기", () => {
  it("초대는 멤버십을 만들지 않는다", async () => {
    const result = await inviteMember("app", { error: null }, form({ mattermostUserId: "mm-kim", role: "MAINTAINER" }));

    expect(result.error).toBeNull();
    expect(mocks.db.projectInvitation.create).toHaveBeenCalled();
    // 여기가 핵심이다. 승인 전에 멤버십이 생기면 초대가 곧 권한이 된다.
    expect(mocks.db.projectMember.upsert).not.toHaveBeenCalled();
    expect(mocks.db.projectMember.create).not.toHaveBeenCalled();
  });

  it("대기 중임을 나타내는 값을 함께 넣어 중복 초대를 DB 가 막게 한다", async () => {
    await inviteMember("app", { error: null }, form({ mattermostUserId: "mm-kim", role: "CONTRIBUTOR" }));
    const data = mocks.db.projectInvitation.create.mock.calls[0]![0].data;
    expect(data.pendingInviteeId).toBe("kim");
    // 사용자명이 아니라 불변 id 로 사람을 고정한다.
    expect(data.inviteeMattermostUserId).toBe("mm-kim");
  });

  it("등록자가 아니면 초대할 수 없다", async () => {
    mocks.access.mockResolvedValue(NOT_OWNER);
    const result = await inviteMember("app", { error: null }, form({ mattermostUserId: "mm-kim", role: "MAINTAINER" }));
    expect(result.error).toBeTruthy();
    expect(mocks.db.projectInvitation.create).not.toHaveBeenCalled();
  });

  it("Mattermost 인증을 안 한 계정은 초대할 수 없다", async () => {
    mocks.db.mattermostIdentity.findUnique.mockResolvedValue(null);
    const result = await inviteMember("app", { error: null }, form({ mattermostUserId: "mm-none", role: "MAINTAINER" }));
    expect(result.error).toContain("Mattermost");
    expect(mocks.db.projectInvitation.create).not.toHaveBeenCalled();
  });

  it("본인은 초대할 수 없다", async () => {
    mocks.db.mattermostIdentity.findUnique.mockResolvedValue({ mattermostUserId: "mm-owner", userId: "owner" });
    const result = await inviteMember("app", { error: null }, form({ mattermostUserId: "mm-owner", role: "MAINTAINER" }));
    expect(result.error).toBeTruthy();
    expect(mocks.db.projectInvitation.create).not.toHaveBeenCalled();
  });

  it("이미 팀원인 사람은 초대할 수 없다", async () => {
    mocks.db.projectMember.findUnique.mockResolvedValue({ role: "CONTRIBUTOR" });
    const result = await inviteMember("app", { error: null }, form({ mattermostUserId: "mm-kim", role: "MAINTAINER" }));
    expect(result.error).toBeTruthy();
    expect(mocks.db.projectInvitation.create).not.toHaveBeenCalled();
  });

  it("OWNER 역할로는 초대할 수 없다", async () => {
    // 소유권 이전은 초대와 다른 일이다.
    const result = await inviteMember("app", { error: null }, form({ mattermostUserId: "mm-kim", role: "OWNER" }));
    expect(result.error).toBeTruthy();
    expect(mocks.db.projectInvitation.create).not.toHaveBeenCalled();
  });

  it("초대는 사이트 알림으로만 알린다", async () => {
    await inviteMember("app", { error: null }, form({ mattermostUserId: "mm-kim", role: "MAINTAINER" }));
    expect(mocks.db.notification.create).toHaveBeenCalled();
    // 초대받은 사람은 이 프로젝트의 알림을 켠 적이 없다.
    expect(mocks.db.mattermostDelivery.create).not.toHaveBeenCalled();
    expect(mocks.db.mattermostDelivery.createMany).not.toHaveBeenCalled();
  });
});

describe("초대에 답하기", () => {
  const pending = {
    id: "invite-1",
    inviteeId: "kim",
    inviterId: "owner",
    inviteeMattermostUserId: "mm-kim",
    role: "MAINTAINER",
    status: "PENDING",
    projectId: "project",
    project: { slug: "app", name: "모아모아", status: "PUBLISHED", ownerId: "owner" },
  };

  /** 지금 연결돼 있는 Mattermost 계정. FOR UPDATE 로 잠그고 읽는다. */
  const connectedAs = (mattermostUserId: string | null) =>
    mocks.db.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const sql = strings.join("");
      if (sql.includes("MattermostIdentity")) {
        return Promise.resolve(mattermostUserId ? [{ mattermostUserId }] : []);
      }
      return Promise.resolve([{ id: "invite-1" }]);
    });

  beforeEach(() => {
    mocks.viewer.mockResolvedValue({ id: "kim" });
    mocks.db.projectInvitation.findUnique.mockResolvedValue(pending);
    mocks.db.projectInvitation.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.projectMember.findUnique.mockResolvedValue(null);
    connectedAs("mm-kim");
  });

  it("수락하면 상태 전환과 멤버십 생성이 한 트랜잭션에서 일어난다", async () => {
    // 답하고 나면 그 초대는 목록에서 사라지므로 결과 메시지를 그 자리에 둘 수 없다.
    // 대신 그 프로젝트로 이동시킨다 — redirect() 는 예외로 흐름을 끊는다.
    await expect(
      respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "yes" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.db.$transaction).toHaveBeenCalled();
    expect(mocks.db.projectInvitation.updateMany.mock.calls[0]![0].data.status).toBe("ACCEPTED");
    expect(mocks.db.projectMember.create).toHaveBeenCalled();
  });

  it("수락해도 알림은 켜지지 않는다", async () => {
    await respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "yes" })).catch(
      () => undefined,
    );
    const create = mocks.db.projectMember.create.mock.calls[0]![0].data;
    // 팀원이 된 것과 메시지를 받겠다는 것은 다른 일이다. 후자는 본인이 따로 켠다.
    expect(create.notifyManagement).toBeUndefined();
    expect(mocks.db.mattermostDelivery.create).not.toHaveBeenCalled();
  });

  it("거절하면 멤버십을 만들지 않는다", async () => {
    await expect(
      respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "no" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.db.projectInvitation.updateMany.mock.calls[0]![0].data.status).toBe("DECLINED");
    expect(mocks.db.projectMember.create).not.toHaveBeenCalled();
  });

  it("남의 초대에는 답할 수 없다", async () => {
    mocks.viewer.mockResolvedValue({ id: "stranger" });
    const result = await respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "yes" }));
    expect(result.error).toBeTruthy();
    expect(mocks.db.projectMember.create).not.toHaveBeenCalled();
  });

  it("이미 취소되거나 거절된 초대는 수락할 수 없다", async () => {
    for (const status of ["CANCELLED", "DECLINED", "ACCEPTED"]) {
      vi.clearAllMocks();
      mocks.db.$transaction.mockImplementation((fn) => fn(mocks.db));
      mocks.db.projectInvitation.findUnique.mockResolvedValue({ ...pending, status });
      connectedAs("mm-kim");
      mocks.db.projectMember.findUnique.mockResolvedValue(null);
      const result = await respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "yes" }));
      expect(result.error).toBeTruthy();
      expect(mocks.db.projectMember.create).not.toHaveBeenCalled();
    }
  });

  it("중복 승인은 조건부 갱신에서 걸린다", async () => {
    // 두 번 누르면 두 번째는 PENDING 인 행을 못 찾아 0건이 된다.
    mocks.db.projectInvitation.updateMany.mockResolvedValue({ count: 0 });
    const result = await respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "yes" }));
    expect(result.error).toBeTruthy();
  });

  it("승인 시점에 연결이 끊겨 있으면 수락할 수 없다", async () => {
    connectedAs(null);
    const result = await respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "yes" }));
    expect(result.error).toContain("Mattermost");
    expect(mocks.db.projectMember.create).not.toHaveBeenCalled();
  });

  it("초대받을 때와 다른 Mattermost 계정으로는 수락할 수 없다", async () => {
    // A 로 인증받아 초대받은 뒤 A 를 끊고 B 를 붙여도 수락되면,
    // 초대한 사람은 A 를 보고 초대했는데 팀에는 B 가 들어온다.
    connectedAs("mm-someone-else");
    const result = await respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "yes" }));

    expect(result.error).toContain("다른 Mattermost 계정");
    expect(mocks.db.projectMember.create).not.toHaveBeenCalled();
    // 실패하면 수락 알림도 생기지 않는다.
    expect(mocks.db.notification.create).not.toHaveBeenCalled();
    expect(mocks.db.projectInvitation.updateMany).not.toHaveBeenCalled();
  });

  it("원래 계정으로는 정상 수락된다", async () => {
    connectedAs("mm-kim");
    await respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "yes" })).catch(
      () => undefined,
    );
    expect(mocks.db.projectMember.create).toHaveBeenCalled();
  });

  it("이미 팀원이면 역할을 덮어쓰지 않고 거절한다", async () => {
    // upsert 로 덮으면 등록자가 정해둔 역할이 오래된 초대 한 장으로 바뀐다.
    mocks.db.projectMember.findUnique.mockResolvedValue({ role: "CONTRIBUTOR" });
    const result = await respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "yes" }));

    expect(result.error).toBeTruthy();
    expect(mocks.db.projectMember.create).not.toHaveBeenCalled();
    expect(mocks.db.projectInvitation.updateMany).not.toHaveBeenCalled();
  });

  it("초대 행을 잠그고 판정한다", async () => {
    // 승인·취소·중복 승인이 같은 초대에 동시에 오면 한 줄로 세워야
    // 최종 상태 하나와 그에 맞는 멤버십만 남는다.
    await respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "no" })).catch(
      () => undefined,
    );
    const sql = mocks.db.$queryRaw.mock.calls.map((c) => (c[0] as string[]).join("?"));
    expect(sql.some((q) => q.includes("project_invitation") && q.includes("FOR UPDATE"))).toBe(true);
  });

  it("거절은 인증 연결을 요구하지 않는다", async () => {
    connectedAs(null);
    await respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "no" })).catch(
      () => undefined,
    );
    expect(mocks.db.projectInvitation.updateMany.mock.calls[0]![0].data.status).toBe("DECLINED");
  });

  it("삭제된 프로젝트의 초대는 수락할 수 없다", async () => {
    mocks.db.projectInvitation.findUnique.mockResolvedValue({
      ...pending,
      project: { ...pending.project, status: "REMOVED" },
    });
    const result = await respondToInvitation({ error: null }, form({ invitationId: "invite-1", accept: "yes" }));
    expect(result.error).toBeTruthy();
    expect(mocks.db.projectMember.create).not.toHaveBeenCalled();
  });
});

describe("초대 취소와 팀원 관리", () => {
  it("대기 중인 초대만 취소된다", async () => {
    mocks.db.projectInvitation.updateMany.mockResolvedValue({ count: 1 });
    await cancelInvitation("app", { error: null }, form({ invitationId: "invite-1" }));
    const call = mocks.db.projectInvitation.updateMany.mock.calls[0]![0];
    expect(call.where.status).toBe("PENDING");
    expect(call.data.pendingInviteeId).toBeNull();
  });

  it("등록자가 아니면 팀원을 제거할 수 없다", async () => {
    mocks.access.mockResolvedValue(NOT_OWNER);
    const result = await removeMember("app", { error: null }, form({ userId: "kim" }));
    expect(result.error).toBeTruthy();
    expect(mocks.db.projectMember.deleteMany).not.toHaveBeenCalled();
  });

  it("등록자는 제거할 수 없다", async () => {
    const result = await removeMember("app", { error: null }, form({ userId: "owner" }));
    expect(result.error).toBeTruthy();
    expect(mocks.db.projectMember.deleteMany).not.toHaveBeenCalled();
  });

  it("팀원을 제거하면 대기 중인 관리 알림도 취소한다", async () => {
    mocks.db.projectMember.deleteMany.mockResolvedValue({ count: 1 });
    await removeMember("app", { error: null }, form({ userId: "kim" }));
    const call = mocks.db.mattermostDelivery.updateMany.mock.calls[0]![0];
    expect(call.where).toMatchObject({ userId: "kim", kind: "MANAGEMENT" });
    expect(call.data.status).toBe("CANCELLED");
  });

  it("공동 관리자를 팀원으로 내리면 관리 알림 동의와 대기 발송이 함께 꺼진다", async () => {
    mocks.db.projectMember.updateMany.mockResolvedValue({ count: 1 });
    await changeMemberRole("app", { error: null }, form({ userId: "kim", role: "CONTRIBUTOR" }));
    expect(mocks.db.projectMember.updateMany.mock.calls[0]![0].data.notifyManagement).toBe(false);
    expect(mocks.db.mattermostDelivery.updateMany.mock.calls[0]![0].data.status).toBe("CANCELLED");
  });

  it("공동 관리자로 올릴 때는 알림을 대신 켜주지 않는다", async () => {
    mocks.db.projectMember.updateMany.mockResolvedValue({ count: 1 });
    await changeMemberRole("app", { error: null }, form({ userId: "kim", role: "MAINTAINER" }));
    const data = mocks.db.projectMember.updateMany.mock.calls[0]![0].data;
    expect(data.notifyManagement).toBeUndefined();
  });
});
