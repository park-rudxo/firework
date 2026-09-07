"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import type { ReportReason, ReportTargetType } from "@prisma/client";

import { submitReport, type ReportState } from "@/features/report/actions";
import { REASON_HINT, REASON_LABEL, REASON_SEVERITY } from "@/features/report/policy";

const INITIAL: ReportState = { ok: false, message: null };

// 심각한 것부터. 상업 판매와 악성코드가 실제로 가장 자주 눌릴 항목이다.
const ORDER: ReportReason[] = [
  "MALWARE",
  "DATA_HARVESTING",
  "COMMERCIAL_SALE",
  "IMPERSONATION",
  "COPYRIGHT",
  "INAPPROPRIATE",
  "RAFFLE_FRAUD",
  "SPAM",
  "BROKEN_LINK",
  "OTHER",
];

export function ReportButton({
  targetType,
  targetId,
  signedIn,
}: {
  targetType: ReportTargetType;
  targetId: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(submitReport, INITIAL);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!signedIn) {
            router.push("/sign-in");
            return;
          }
          setOpen(true);
        }}
        title="신고"
        className="rounded-xl border border-border p-2 text-muted-foreground transition hover:text-danger"
      >
        <Flag className="size-4" aria-hidden />
        <span className="sr-only">신고하기</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">신고하기</h2>

        {state.ok ? (
          <>
            <p className="mt-4 text-sm text-success">{state.message}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-xl border border-border py-2.5 text-sm"
            >
              닫기
            </button>
          </>
        ) : (
          <form action={formAction} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">사유</legend>
              {ORDER.map((reason) => (
                <label
                  key={reason}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 text-sm hover:bg-surface-muted"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={reason}
                    required
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <span>
                    {REASON_LABEL[reason]}
                    {REASON_SEVERITY[reason] === "CRITICAL" ? (
                      <span className="ml-1.5 rounded bg-danger/10 px-1.5 py-0.5 text-[11px] text-danger">
                        긴급
                      </span>
                    ) : null}
                    {REASON_HINT[reason] ? (
                      <span className="block text-xs text-muted-foreground">
                        {REASON_HINT[reason]}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">상세 설명 (선택)</span>
              <textarea
                name="detail"
                rows={3}
                placeholder="어디에서 어떤 문제를 발견했는지 적어주시면 검토가 빨라집니다."
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>

            <p className="text-xs text-muted-foreground">
              신고만으로 프로젝트가 자동으로 내려가지는 않습니다. 관리자가 직접 확인한 뒤
              조치합니다.
            </p>

            {state.message ? <p className="text-sm text-danger">{state.message}</p> : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {pending ? "접수 중…" : "신고"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
