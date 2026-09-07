"use client";

import { useActionState } from "react";

import { updateProfile, type ProfileState } from "@/features/profile/actions";

const INITIAL: ProfileState = { error: null, saved: false };

export function ProfileForm({
  values,
}: {
  values: {
    displayName: string;
    bio: string;
    ssafyGeneration: number | null;
    ssafyTrack: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updateProfile, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">표시 이름</span>
        <input
          name="displayName"
          required
          defaultValue={values.displayName}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">
          프로젝트 등록자로 표시되는 이름입니다. 설문 응답에는 절대 표시되지 않습니다.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">소개 (선택)</span>
        <textarea
          name="bio"
          rows={3}
          defaultValue={values.bio}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">기수 (선택)</span>
          <input
            type="number"
            name="ssafyGeneration"
            min={1}
            max={50}
            defaultValue={values.ssafyGeneration ?? ""}
            placeholder="13"
            className="w-28 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">트랙 (선택)</span>
          <input
            name="ssafyTrack"
            defaultValue={values.ssafyTrack}
            placeholder="Java / Python / Embedded"
            className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        SSAFY 소속은 선택 입력입니다. 외부에서 오신 분도 그대로 쓰실 수 있습니다.
      </p>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.saved ? <p className="text-sm text-success">저장했습니다.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}
