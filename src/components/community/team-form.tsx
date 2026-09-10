"use client";
import { useActionState } from "react";
import type { ReactNode } from "react";
import type { TeamState } from "@/features/team/actions";

/**
 * 팀 관리용 폼. community/action-form.tsx 와 모양은 같지만 상태 타입이 다르다.
 */
export function TeamForm({
  action,
  children,
  label = "저장",
  className = "",
  danger = false,
  note,
}: {
  action: (state: TeamState, form: FormData) => Promise<TeamState>;
  children?: ReactNode;
  label?: string;
  className?: string;
  danger?: boolean;
  /**
   * 더 이상 누를 수 없게 됐을 때 버튼 자리에 들어가는 말.
   *
   * 폼을 통째로 걷어내지 않는 이유는, 걷어내면 방금 한 일의 결과 메시지도 함께
   * 사라지기 때문이다. 초대하자마자 그 사람이 화면에서 없어지면 됐는지 실패했는지
   * 알 수 없다.
   */
  note?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className={"space-y-3 " + className}>
      <fieldset disabled={pending} className="flex flex-wrap items-end gap-2">
        {note ? (
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted-foreground">
            {note}
          </span>
        ) : (
          <>
            {children}
            <button
              className={
                danger
                  ? "rounded-xl border border-border px-3 py-2 text-sm text-red-600 disabled:opacity-50"
                  : "rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              }
              disabled={pending}
            >
              {pending ? "처리 중…" : label}
            </button>
          </>
        )}
      </fieldset>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-success">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
