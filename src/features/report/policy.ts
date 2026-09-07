import type { ReportReason, ReportSeverity } from "@prisma/client";

/**
 * 신고 정책.
 *
 * **자동 숨김은 의도적으로 없다.** 신고 N건으로 프로젝트가 내려간다면 경쟁 프로젝트를
 * 신고 몇 번으로 죽일 수 있고, 오신고 한 번에 멀쩡한 프로젝트가 사라진다.
 * 그래서 severity 는 프로젝트의 상태를 바꾸지 않고, 관리자 알림 세기와
 * 큐 정렬 순서만 결정한다. 숨김·삭제는 언제나 관리자의 수동 판단이다.
 */
export const REASON_SEVERITY: Record<ReportReason, ReportSeverity> = {
  MALWARE: "CRITICAL",
  DATA_HARVESTING: "CRITICAL",
  IMPERSONATION: "CRITICAL",

  COMMERCIAL_SALE: "HIGH",
  COPYRIGHT: "HIGH",
  INAPPROPRIATE: "HIGH",
  RAFFLE_FRAUD: "HIGH",

  SPAM: "NORMAL",
  OTHER: "NORMAL",

  // 제보성. 관리자 큐를 거치지 않고 제작자에게만 전달된다.
  BROKEN_LINK: "INFO",
};

export const REASON_LABEL: Record<ReportReason, string> = {
  MALWARE: "악성코드 · 바이러스 · 피싱",
  DATA_HARVESTING: "과도한 개인정보 수집 · 계정 정보 요구",
  IMPERSONATION: "타인 · 기업 사칭",
  COMMERCIAL_SALE: "외부 상업 판매 · 결제 유도 · 광고",
  COPYRIGHT: "코드 · 에셋 도용, 라이선스 위반",
  INAPPROPRIATE: "음란 · 폭력 · 혐오 표현",
  RAFFLE_FRAUD: "추첨 조작 · 경품 미지급",
  SPAM: "도배 · 중복 등록",
  BROKEN_LINK: "링크 깨짐 · 동작하지 않음",
  OTHER: "기타",
};

export const REASON_HINT: Partial<Record<ReportReason, string>> = {
  COMMERCIAL_SALE: "프로젝트를 가장해 상품을 팔거나 외부 결제로 유도하는 경우입니다.",
  DATA_HARVESTING: "정당한 이유 없이 로그인 정보나 주민번호 등을 요구하는 경우입니다.",
  BROKEN_LINK: "관리자를 거치지 않고 제작자에게만 전달됩니다.",
  RAFFLE_FRAUD: "추첨 결과는 공개 검증 페이지에서 직접 재계산해볼 수 있습니다.",
};

/** 관리자 큐 정렬용 가중치. 숫자가 클수록 위로 온다. */
export const SEVERITY_WEIGHT: Record<ReportSeverity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  NORMAL: 1,
  INFO: 0,
};

/** INFO 는 관리자 큐에 들어가지 않고 제작자에게만 간다. */
export function goesToAdminQueue(severity: ReportSeverity): boolean {
  return severity !== "INFO";
}
