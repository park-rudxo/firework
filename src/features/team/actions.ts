"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";
import { CommunityError, projectAccess } from "@/features/community/access";

export type TeamState = { error: string | null; success?: string };

/**
 * 팀 초대.
 *
 * **초대는 멤버십이 아니다.** 대기 중인 초대는 권한을 하나도 만들지 않고, 본인이
 * 승인해야 ProjectMember 가 생긴다. 초대하는 쪽이 남의 계정을 남의 프로젝트에 밀어
 * 넣을 수 있으면 초대는 권한이 아니라 스팸이 된다.
 *
 * 팀 구성을 바꾸는 일(초대·취소·역할 변경·제거)은 **등록자만** 한다. 공동 관리자가
 * 팀을 바꿀 수 있으면 등록자가 모르는 사이에 팀이 달라진다.
 */

// OWNER 는 없다. 소유권 이전은 초대와 다른 일이고 이번 범위 밖이다.
const invitableRole = z.enum(["MAINTAINER", "CONTRIBUTOR"]);

function failure(error: unknown): TeamState {
  return {
    error:
      error instanceof CommunityError
        ? error.message
        : "처리하지 못했습니다. 로그인 상태를 확인하고 다시 시도해주세요.",
  };
}

function refresh(slug: string) {
  revalidatePath("/invitations");
  revalidatePath(`/dashboard/projects/${slug}/team`);
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/dashboard");
}

/** 등록자만 팀 구성을 바꾼다. */
async function requireOwner(slug: string, userId: string) {
  const access = await projectAccess(slug, userId);
  if (!access.owner) throw new CommunityError("팀 구성은 프로젝트 등록자만 바꿀 수 있습니다.");
  return access.project;
}

export async function inviteMember(
  slug: string,
  _state: TeamState,
  form: FormData,
): Promise<TeamState> {
  try {
    const viewer = await requireViewer();
    const project = await requireOwner(slug, viewer.id);

    const parsed = z
      .object({ mattermostUserId: z.string().trim().min(1), role: invitableRole })
      .safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new CommunityError("초대할 사람과 역할을 확인해주세요.");

    // 사용자명이 아니라 불변 id 로 사람을 찾는다. 폼이 열려 있는 사이에 사용자명이
    // 바뀌어도 엉뚱한 사람을 초대하지 않는다.
    const identity = await db.mattermostIdentity.findUnique({
      where: { mattermostUserId: parsed.data.mattermostUserId },
      select: { mattermostUserId: true, userId: true },
    });
    if (!identity) {
      throw new CommunityError(
        "Mattermost 인증을 마친 계정만 초대할 수 있습니다. 상대에게 계정 연결을 먼저 부탁해주세요.",
      );
    }
    if (identity.userId === viewer.id) throw new CommunityError("본인은 초대할 수 없습니다.");

    const already = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: identity.userId } },
      select: { role: true },
    });
    if (already || identity.userId === project.ownerId) {
      throw new CommunityError("이미 이 프로젝트의 팀원입니다.");
    }

    try {
      await db.$transaction(async (tx) => {
        const invitation = await tx.projectInvitation.create({
          data: {
            projectId: project.id,
            inviterId: viewer.id,
            inviteeId: identity.userId,
            inviteeMattermostUserId: identity.mattermostUserId,
            role: parsed.data.role,
            // PENDING 인 동안에만 값이 있다. 이 컬럼의 UNIQUE 가 중복 대기 초대를 막는다.
            pendingInviteeId: identity.userId,
          },
          select: { id: true },
        });
        // 초대는 사이트 안에서만 알린다. 외부 알림은 본인이 켠 적이 없으므로 보내지 않는다.
        await tx.notification.create({
          data: {
            userId: identity.userId,
            type: "PROJECT_INVITED",
            title: `${project.name} 팀에 초대받았습니다`,
            body: "초대함에서 수락하거나 거절할 수 있습니다.",
            url: `/invitations#invite-${invitation.id}`,
          },
        });
      });
    } catch (err) {
      // (projectId, pendingInviteeId) UNIQUE — 동시 요청 두 개는 여기서 갈린다.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new CommunityError("이미 보낸 초대가 대기 중입니다.");
      }
      throw err;
    }

    refresh(slug);
    return { error: null, success: "초대를 보냈습니다. 상대가 수락해야 팀원이 됩니다." };
  } catch (error) {
    return failure(error);
  }
}

/** 보낸 초대를 거둬들인다. 이미 답한 초대는 건드리지 않는다. */
export async function cancelInvitation(
  slug: string,
  _state: TeamState,
  form: FormData,
): Promise<TeamState> {
  try {
    const viewer = await requireViewer();
    const project = await requireOwner(slug, viewer.id);
    const invitationId = String(form.get("invitationId") ?? "");

    const changed = await db.projectInvitation.updateMany({
      where: { id: invitationId, projectId: project.id, status: "PENDING" },
      data: { status: "CANCELLED", pendingInviteeId: null, respondedAt: new Date() },
    });
    if (!changed.count) throw new CommunityError("취소할 수 있는 초대가 아닙니다.");

    refresh(slug);
    return { error: null, success: "초대를 취소했습니다." };
  } catch (error) {
    return failure(error);
  }
}

/**
 * 초대에 답한다. **수신자 본인만** 할 수 있다.
 *
 * 수락은 한 트랜잭션이다. 초대 상태 전환과 ProjectMember 생성이 갈라지면,
 * 초대는 수락됐는데 팀원이 아니거나 그 반대인 상태가 남는다.
 */
export async function respondToInvitation(
  _state: TeamState,
  form: FormData,
): Promise<TeamState> {
  try {
    const viewer = await requireViewer();
    const parsed = z
      .object({ invitationId: z.string().min(1), accept: z.enum(["yes", "no"]) })
      .safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new CommunityError("잘못된 요청입니다.");

    const invitation = await db.projectInvitation.findUnique({
      where: { id: parsed.data.invitationId },
      select: {
        id: true,
        inviteeId: true,
        inviterId: true,
        role: true,
        status: true,
        projectId: true,
        project: { select: { slug: true, name: true, status: true, ownerId: true } },
      },
    });
    // 남의 초대인지 없는 초대인지 구분해 알려주지 않는다.
    if (!invitation || invitation.inviteeId !== viewer.id) {
      throw new CommunityError("초대를 찾을 수 없습니다.");
    }
    if (invitation.status !== "PENDING") throw new CommunityError("이미 처리된 초대입니다.");

    const accepted = parsed.data.accept === "yes";

    if (accepted) {
      if (invitation.project.status === "REMOVED") {
        throw new CommunityError("삭제된 프로젝트입니다.");
      }
      // 초대받은 뒤 연결을 해제했을 수 있다. 승인 시점에도 다시 확인한다.
      const identity = await db.mattermostIdentity.findUnique({
        where: { userId: viewer.id },
        select: { userId: true },
      });
      if (!identity) {
        throw new CommunityError("Mattermost 계정 인증을 마친 뒤에 수락할 수 있습니다.");
      }
      if (invitation.project.ownerId === viewer.id) {
        throw new CommunityError("이미 이 프로젝트의 등록자입니다.");
      }
    }

    await db.$transaction(async (tx) => {
      // 상태 전환도 조건부다. 두 번 누르면 두 번째는 여기서 0건이 된다.
      const changed = await tx.projectInvitation.updateMany({
        where: { id: invitation.id, inviteeId: viewer.id, status: "PENDING" },
        data: {
          status: accepted ? "ACCEPTED" : "DECLINED",
          pendingInviteeId: null,
          respondedAt: new Date(),
        },
      });
      if (!changed.count) throw new CommunityError("이미 처리된 초대입니다.");

      if (accepted) {
        // 알림은 켜지 않는다(notifyManagement 기본 false). 팀원이 된 것과
        // 메시지를 받겠다는 것은 다른 일이고, 후자는 본인이 따로 켠다.
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: invitation.projectId, userId: viewer.id } },
          create: { projectId: invitation.projectId, userId: viewer.id, role: invitation.role },
          update: { role: invitation.role },
        });
      }

      await tx.notification.create({
        data: {
          userId: invitation.inviterId,
          type: "PROJECT_INVITE_ANSWERED",
          title: accepted
            ? `${invitation.project.name} 팀 초대를 수락했습니다`
            : `${invitation.project.name} 팀 초대를 거절했습니다`,
          url: `/dashboard/projects/${encodeURIComponent(invitation.project.slug)}/team`,
        },
      });
    });

    refresh(invitation.project.slug);

    // 답하고 나면 그 초대는 목록에서 사라진다. 결과 메시지를 그 자리에 두면 카드와
    // 함께 없어져, 눌렀는데 아무 일도 없었던 것처럼 보인다. 그래서 자리를 옮긴다.
    if (accepted) {
      // 수락했으면 그 프로젝트로 데려간다. 합류했다는 사실이 화면으로 보인다.
      const slug = encodeURIComponent(invitation.project.slug);
      redirect(
        invitation.role === "MAINTAINER"
          ? `/dashboard/projects/${slug}/community?joined=1`
          : `/projects/${slug}?joined=1`,
      );
    }
    redirect("/invitations?done=declined");
  } catch (error) {
    // redirect() 와 notFound() 는 예외로 흐름을 끊는다. 여기서 삼키면 이동이 취소된다.
    unstable_rethrow(error);
    return failure(error);
  }
}

/**
 * 역할 변경과 제거.
 *
 * 권한이 줄거나 사라지면 **대기 중인 관리 알림도 함께 취소한다.** 큐에 남아 있던 것이
 * 나가면, 더 이상 관리자가 아닌 사람에게 "관리 중인 프로젝트에 신고가 접수됐다" 는
 * 메시지가 도착한다. 발송 직전 권한 재검사가 이미 걸러내지만, 취소를 눈에 보이게
 * 남겨두는 편이 낫다.
 */
export async function changeMemberRole(
  slug: string,
  _state: TeamState,
  form: FormData,
): Promise<TeamState> {
  try {
    const viewer = await requireViewer();
    const project = await requireOwner(slug, viewer.id);

    const parsed = z
      .object({ userId: z.string().min(1), role: invitableRole })
      .safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new CommunityError("역할을 확인해주세요.");
    if (parsed.data.userId === project.ownerId) {
      throw new CommunityError("등록자의 역할은 바꿀 수 없습니다.");
    }

    await db.$transaction(async (tx) => {
      const changed = await tx.projectMember.updateMany({
        where: { projectId: project.id, userId: parsed.data.userId },
        data: {
          role: parsed.data.role,
          ...(parsed.data.role === "CONTRIBUTOR"
            ? { notifyManagement: false, notificationChangedAt: new Date() }
            : {}),
        },
      });
      if (!changed.count) throw new CommunityError("팀원을 찾을 수 없습니다.");

      if (parsed.data.role === "CONTRIBUTOR") {
        await tx.mattermostDelivery.updateMany({
          where: {
            userId: parsed.data.userId,
            projectId: project.id,
            kind: "MANAGEMENT",
            status: { in: ["PENDING", "SENDING"] },
          },
          data: { status: "CANCELLED" },
        });
      }
    });

    refresh(slug);
    return { error: null, success: "역할을 바꿨습니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function removeMember(
  slug: string,
  _state: TeamState,
  form: FormData,
): Promise<TeamState> {
  try {
    const viewer = await requireViewer();
    const project = await requireOwner(slug, viewer.id);
    const userId = String(form.get("userId") ?? "");
    if (userId === project.ownerId) throw new CommunityError("등록자는 제거할 수 없습니다.");

    await db.$transaction(async (tx) => {
      const removed = await tx.projectMember.deleteMany({
        where: { projectId: project.id, userId },
      });
      if (!removed.count) throw new CommunityError("팀원을 찾을 수 없습니다.");
      await tx.mattermostDelivery.updateMany({
        where: {
          userId,
          projectId: project.id,
          kind: "MANAGEMENT",
          status: { in: ["PENDING", "SENDING"] },
        },
        data: { status: "CANCELLED" },
      });
    });

    refresh(slug);
    return { error: null, success: "팀원을 제거했습니다." };
  } catch (error) {
    return failure(error);
  }
}
