"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";

import { createEvent, type EventState } from "@/features/calendar/actions";

const INITIAL: EventState = { error: null };

// 설문·추첨은 자동 생성되므로 손으로 만들 수 있는 타입만 둔다.
const TYPES = [
  { value: "TEST", label: "베타 테스트" },
  { value: "UPDATE", label: "업데이트" },
  { value: "RELEASE", label: "정식 출시" },
  { value: "MILESTONE", label: "마일스톤" },
  { value: "OTHER", label: "기타" },
];

export function CreateEventForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createEvent.bind(null, slug), INITIAL);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-muted"
      >
        <CalendarPlus className="size-4" aria-hidden />
        일정 추가
      </button>
    );
  }

  return (
    <form
      action={async (form) => {
        await formAction(form);
        router.refresh();
      }}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">종류</span>
          <select
            name="type"
            className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-56 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">제목</span>
          <input
            name="title"
            required
            placeholder="v1.2 업데이트 — 다크모드 추가"
            className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">설명 (선택)</span>
        <textarea
          name="description"
          rows={2}
          className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">시작일</span>
          <input
            type="date"
            name="startsAt"
            required
            className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">종료일 (선택)</span>
          <input
            type="date"
            name="endsAt"
            className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>

      <input type="hidden" name="allDay" value="on" />

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-border px-4 py-2.5 text-sm"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? "추가 중…" : "일정 추가"}
        </button>
      </div>
    </form>
  );
}
