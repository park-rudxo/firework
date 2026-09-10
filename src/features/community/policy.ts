export const BUG_STATUS_LABEL = { OPEN: "접수", INVESTIGATING: "확인 중", FIXED: "수정 완료" } as const;
export function canManage(ownerId: string, userId: string, role?: string | null) {
  return ownerId === userId || role === "OWNER" || role === "MAINTAINER";
}
export function consentAllows(enabled: boolean, changedAt: Date, eventAt: Date) {
  return enabled && changedAt.getTime() <= eventAt.getTime();
}

