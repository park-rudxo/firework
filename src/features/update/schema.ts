import { z } from "zod";
import type { ProjectUpdateKind } from "@prisma/client";

export const UPDATE_KIND_LABEL: Record<ProjectUpdateKind, string> = {
  PROGRESS: "진행 상황",
  RELEASE: "새 버전",
  FIX: "버그 수정",
  NOTICE: "공지",
};

export const updateKindSchema = z.enum(["PROGRESS", "RELEASE", "FIX", "NOTICE"]);

export const projectUpdateInputSchema = z.object({
  kind: updateKindSchema.default("PROGRESS"),
  title: z.string().trim().min(2, "제목을 적어주세요").max(120),
  body: z.string().trim().min(10, "무엇이 달라졌는지 적어주세요").max(8000),
  /** 이 소식으로 해결한 제보. 체크박스로 고른다. */
  fixedBugReportIds: z.array(z.string()).max(50).default([]),
  /** 구독자에게 알릴지. 오타 수정 같은 작은 변경까지 알리면 알림이 소음이 된다. */
  notifySubscribers: z.boolean().default(true),
});

export function projectUpdateInputFromFormData(form: FormData) {
  return {
    kind: String(form.get("kind") ?? "PROGRESS"),
    title: String(form.get("title") ?? ""),
    body: String(form.get("body") ?? ""),
    fixedBugReportIds: form.getAll("fixedBugReportIds").map(String).filter(Boolean),
    notifySubscribers: form.get("notifySubscribers") === "on",
  };
}
