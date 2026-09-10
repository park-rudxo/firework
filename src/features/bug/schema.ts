import { z } from "zod";
import type { BugReportStatus } from "@prisma/client";

export const BUG_STATUS_LABEL: Record<BugReportStatus, string> = {
  RECEIVED: "접수",
  TRIAGING: "확인 중",
  FIXED: "수정 완료",
  WONTFIX: "고치지 않음",
  DUPLICATE: "중복",
};

export const BUG_STATUS_HINT: Record<BugReportStatus, string> = {
  RECEIVED: "아직 팀이 확인하기 전입니다.",
  TRIAGING: "팀이 재현하고 원인을 찾는 중입니다.",
  FIXED: "고쳐서 반영했습니다.",
  WONTFIX: "확인했지만 고치지 않기로 했습니다.",
  DUPLICATE: "이미 접수된 제보와 같은 내용입니다.",
};

/** 제보자가 결과를 기다릴 이유가 남아 있는 상태. 목록 기본 필터에 쓴다. */
export const OPEN_BUG_STATUSES: BugReportStatus[] = ["RECEIVED", "TRIAGING"];

export const bugStatusSchema = z.enum([
  "RECEIVED",
  "TRIAGING",
  "FIXED",
  "WONTFIX",
  "DUPLICATE",
]);

export const bugReportInputSchema = z.object({
  title: z.string().trim().min(4, "무엇이 안 되는지 한 줄로 적어주세요").max(120),
  detail: z
    .string()
    .trim()
    .min(10, "어떤 순서로 하면 그렇게 되는지 적어주시면 훨씬 빨리 고칠 수 있습니다")
    .max(4000),
  // 실행 형태가 웹·앱·확장 프로그램으로 갈리므로 형식을 강제하지 않는다.
  environment: z.string().trim().max(200).optional(),
  // 기본은 꺼짐. 켠 사람만 처리 결과 알림을 받는다.
  notifyReporter: z.boolean().default(false),
});

export type BugReportInput = z.infer<typeof bugReportInputSchema>;

export function bugReportInputFromFormData(form: FormData) {
  return {
    title: String(form.get("title") ?? ""),
    detail: String(form.get("detail") ?? ""),
    environment: String(form.get("environment") ?? "") || undefined,
    notifyReporter: form.get("notifyReporter") === "on",
  };
}
