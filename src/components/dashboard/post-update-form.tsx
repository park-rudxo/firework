"use client";

import { useActionState } from "react";
import type { ProjectUpdateKind } from "@prisma/client";

import { postProjectUpdate } from "@/features/update/actions";
import { UPDATE_KIND_LABEL } from "@/features/update/schema";

const KINDS: ProjectUpdateKind[] = ["PROGRESS", "RELEASE", "FIX", "NOTICE"];

/**
 * 진행 소식 작성.
 *
 * 알림 체크박스는 켠 채로 시작한다. 여기는 "구독자에게 알릴까" 를 정하는 자리이고,
 * 구독자 쪽에서 이미 기본 꺼짐으로 한 번 걸러졌다. 두 번 끄면 아무에게도 닿지 않는다.
 * 다만 오타 수정 같은 것까지 알리면 소음이 되므로 끌 수 있게 둔다.
 */
export function PostUpdateForm({
  slug,
  openBugs,
}: {
  slug: string;
  openBugs: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(postProjectUpdate.bind(null, slug), {
    ok: false,
    message: null,
  });

  return (
    <form action={action} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          종류
          <select
            name="kind"
            defaultValue="PROGRESS"
            className="rounded-xl border border-border bg-background px-3 py-2"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {UPDATE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm">
          제목
          <input
            name="title"
            required
            maxLength={120}
            placeholder="0.3.0 — 로그인 후 흰 화면이 뜨던 문제를 고쳤습니다"
            className="rounded-xl border border-border bg-background px-3 py-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        내용
        <textarea
          name="body"
          required
          rows={5}
          maxLength={8000}
          placeholder={"무엇이 달라졌는지 사용자 입장에서 적어주세요. 마크다운을 쓸 수 있습니다."}
          className="rounded-xl border border-border bg-background px-3 py-2"
        />
      </label>

      {openBugs.length > 0 ? (
        <fieldset className="rounded-xl border border-border p-3">
          <legend className="px-1 text-sm">이 소식으로 해결한 제보</legend>
          <p className="text-xs text-muted-foreground">
            고른 제보는 수정 완료로 바뀝니다. 제보자가 알림을 켜뒀다면 함께 알려집니다.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {openBugs.map((b) => (
              <li key={b.id}>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="fixedBugReportIds"
                    value={b.id}
                    className="mt-0.5"
                  />
                  {b.title}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="notifySubscribers" defaultChecked className="mt-0.5" />
        <span>
          구독자에게 알리기
          <span className="block text-xs text-muted-foreground">
            사이트 알림은 구독자 전원에게, Mattermost 메시지는 이 프로젝트의 업데이트 알림을 직접
            켠 사람에게만 갑니다.
          </span>
        </span>
      </label>

      {state.message ? (
        <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "올리는 중…" : "소식 올리기"}
      </button>
    </form>
  );
}
