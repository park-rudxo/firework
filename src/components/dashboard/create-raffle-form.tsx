"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";

import { createRaffle, type RaffleState } from "@/features/raffle/actions";

const INITIAL: RaffleState = { error: null };

export function CreateRaffleForm({ slug, surveyId }: { slug: string; surveyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createRaffle.bind(null, slug), INITIAL);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white"
      >
        <Gift className="size-4" aria-hidden />
        추첨 열기
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
      <input type="hidden" name="surveyId" value={surveyId} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">경품</span>
        <input
          name="prizeName"
          required
          placeholder="스타벅스 아메리카노 기프티콘"
          className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">설명 (선택)</span>
        <textarea
          name="prizeDescription"
          rows={2}
          className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">당첨 인원</span>
          <input
            type="number"
            name="winnerCount"
            min={1}
            max={100}
            defaultValue={1}
            required
            className="w-28 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">응모 마감</span>
          <input
            type="date"
            name="closesAt"
            required
            className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>

      <p className="rounded-lg bg-surface-muted p-3 text-xs text-muted-foreground">
        추첨을 열면 무작위 시드가 만들어지고 그 해시가 즉시 공개됩니다. 응모자를 다 본 뒤에 결과를
        바꾸려 해도 공개된 해시와 어긋나므로, 본인도 운영자도 결과를 손댈 수 없습니다. 이미 설문에
        응답한 사람도 소급해서 응모됩니다.
      </p>

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
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "여는 중…" : "추첨 열기"}
        </button>
      </div>
    </form>
  );
}
