export const BUG_STATUS_LABEL = { OPEN: "접수", INVESTIGATING: "확인 중", FIXED: "수정 완료" } as const;

/**
 * 프로젝트 권한 판정. **이 함수 하나만 쓴다.**
 *
 * `ownerId === userId` 를 곳곳에서 직접 비교하면, ProjectMember 에 역할을 만들어두고도
 * 공동 관리자가 할 수 있는 일이 하나도 없다. 팀이 만든 프로젝트를 모으는 서비스에서
 * 그건 고장이다. 설문·추첨·일정·수정도 전부 여기를 지난다.
 */
export function canManage(ownerId: string, userId: string, role?: string | null) {
  return ownerId === userId || role === "OWNER" || role === "MAINTAINER";
}

/**
 * 되돌리기 어려운 일 — 공개·비공개 전환, 팀원 초대와 제거, 역할 변경.
 * MAINTAINER 에게는 주지 않는다. 공동 관리자가 팀 구성을 바꿀 수 있으면
 * 등록자가 모르는 사이에 팀이 달라진다.
 */
export function canAdminister(ownerId: string, userId: string) {
  return ownerId === userId;
}

/** 팀에 이름이 올라간 사람인지. 자기 팀 설문에 응답하는 것을 막는 데 쓴다. */
export function isTeamMember(ownerId: string, userId: string, role?: string | null) {
  return ownerId === userId || Boolean(role);
}

export function consentAllows(enabled: boolean, changedAt: Date, eventAt: Date) {
  return enabled && changedAt.getTime() <= eventAt.getTime();
}
