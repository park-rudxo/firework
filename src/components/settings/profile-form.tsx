"use client";

import { useActionState } from "react";

import { NicknameFields } from "@/components/profile/nickname-fields";
import { updateProfile, type ProfileState } from "@/features/profile/actions";

const INITIAL: ProfileState = { error: null, saved: false };

export function ProfileForm({
  values,
}: {
  values: {
    displayName: string;
    bio: string;
    ssafyTrack: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updateProfile, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">닉네임</span>
        <NicknameFields defaultValue={values.displayName} />
        <span className="text-xs text-muted-foreground">
          프로젝트 등록자로 표시되는 이름입니다. 설문 응답에는 절대 표시되지 않습니다.
        </span>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">소개 (선택)</span>
        <textarea
          name="bio"
          rows={3}
          defaultValue={values.bio}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">트랙 (선택)</span>
        <input
          name="ssafyTrack"
          defaultValue={values.ssafyTrack}
          placeholder="Java / Python / Embedded"
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

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
