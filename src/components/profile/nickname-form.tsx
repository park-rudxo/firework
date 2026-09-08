"use client";

import { useActionState } from "react";

import { NicknameFields } from "@/components/profile/nickname-fields";
import { setNickname, type ProfileState } from "@/features/profile/actions";

const INITIAL: ProfileState = { error: null, saved: false };

export function NicknameForm({ next, defaultValue }: { next: string; defaultValue?: string }) {
  // 성공하면 서버 액션이 next 로 리다이렉트하므로 여기서 성공 상태를 그릴 일이 없다.
  const [state, formAction, pending] = useActionState(setNickname.bind(null, next), INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <NicknameFields defaultValue={defaultValue} />

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "저장 중…" : "이 이름으로 시작하기"}
      </button>
    </form>
  );
}
