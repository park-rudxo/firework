import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canAdminister, canManage, isTeamMember } from "@/features/community/policy";

/**
 * 권한 판정은 이 세 함수만 쓴다.
 *
 * `ownerId === userId` 를 곳곳에서 직접 비교하면, ProjectMember 에 역할을 만들어두고도
 * 공동 관리자가 할 수 있는 일이 하나도 없다. 팀이 만든 프로젝트를 모으는 서비스에서
 * 그건 고장이다.
 */
describe("프로젝트 권한", () => {
  const OWNER = "owner";

  it("등록자는 운영과 팀 구성을 모두 할 수 있다", () => {
    expect(canManage(OWNER, OWNER)).toBe(true);
    expect(canAdminister(OWNER, OWNER)).toBe(true);
  });

  it("공동 관리자는 운영은 하지만 팀 구성은 바꾸지 못한다", () => {
    expect(canManage(OWNER, "kim", "MAINTAINER")).toBe(true);
    // 공동 관리자가 팀을 바꿀 수 있으면 등록자가 모르는 사이에 팀이 달라진다.
    expect(canAdminister(OWNER, "kim")).toBe(false);
  });

  it("일반 팀원은 이름만 올라갈 뿐 운영 권한이 없다", () => {
    expect(canManage(OWNER, "lee", "CONTRIBUTOR")).toBe(false);
    expect(canAdminister(OWNER, "lee")).toBe(false);
  });

  it("남은 아무 권한도 없다", () => {
    expect(canManage(OWNER, "stranger", null)).toBe(false);
    expect(canManage(OWNER, "stranger", undefined)).toBe(false);
    expect(isTeamMember(OWNER, "stranger", null)).toBe(false);
  });

  it("팀에 이름이 올라간 사람은 역할과 무관하게 팀원이다", () => {
    // 자기 팀 설문에 응답해 응모권을 만드는 것을 막는 기준이다.
    // 등록자만 막으면 나머지 팀원이 응모권을 나눠 가지면 그만이다.
    expect(isTeamMember(OWNER, OWNER)).toBe(true);
    expect(isTeamMember(OWNER, "kim", "MAINTAINER")).toBe(true);
    expect(isTeamMember(OWNER, "lee", "CONTRIBUTOR")).toBe(true);
  });
});

/**
 * 초대는 스키마로도 못박아 둔다. 여기 깨지면 누군가 초대의 성질을 바꾼 것이다.
 */
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

function modelBody(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`${name} 모델을 찾을 수 없습니다`);
  return match[1]!;
}

describe("팀 초대 스키마", () => {
  const invitation = modelBody("ProjectInvitation");

  it("대기 중인 초대는 한 사람당 하나뿐이다", () => {
    // PENDING 인 동안에만 값이 있고 나머지는 NULL 이다. Postgres 에서 NULL 은
    // 서로 충돌하지 않으므로 이 UNIQUE 가 곧 부분 유니크 제약이 된다.
    // 앱에서도 검사하지만 동시 요청 두 개는 DB 만 막을 수 있다.
    expect(invitation).toMatch(/pendingInviteeId\s+String\?/);
    expect(invitation).toMatch(/@@unique\(\[projectId, pendingInviteeId\]\)/);
  });

  it("초대를 사람에게 고정하는 것은 사용자명이 아니라 불변 id 다", () => {
    expect(invitation).toMatch(/inviteeMattermostUserId\s+String/);
    expect(invitation).not.toMatch(/inviteeUsername/);
  });

  it("초대 자체는 권한을 담지 않는다", () => {
    // 권한은 ProjectMember 에만 있다. 초대 행에 알림 동의 같은 것이 붙기 시작하면
    // 승인 전에 이미 무언가가 켜진 상태가 생긴다.
    expect(invitation).not.toMatch(/notify/i);
    expect(invitation).toMatch(/status\s+ProjectInvitationStatus\s+@default\(PENDING\)/);
  });
});
