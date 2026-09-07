"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, BellRing, Heart, Check, Hand } from "lucide-react";

import { toggleFollow, toggleLike, toggleTry } from "@/features/project/actions";

type Counts = { likes: number; follows: number; tries: number };
type Reactions = { liked: boolean; following: boolean; tried: boolean };

export function ProjectReactions({
  slug,
  counts,
  initial,
  signedIn,
}: {
  slug: string;
  counts: Counts;
  initial: Reactions;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState({ ...initial, ...counts });
  const [, startTransition] = useTransition();

  const run = (
    key: keyof Reactions,
    countKey: keyof Counts,
    action: (slug: string) => Promise<{ active: boolean }>,
  ) => {
    if (!signedIn) {
      router.push(`/sign-in?next=/projects/${slug}`);
      return;
    }
    // 낙관적으로 먼저 뒤집고, 실패하면 되돌린다.
    const before = state[key];
    setState((s) => ({
      ...s,
      [key]: !before,
      [countKey]: s[countKey] + (before ? -1 : 1),
    }));

    startTransition(async () => {
      try {
        await action(slug);
      } catch {
        setState((s) => ({
          ...s,
          [key]: before,
          [countKey]: s[countKey] + (before ? 1 : -1),
        }));
      }
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <ReactionButton
        active={state.tried}
        onClick={() => run("tried", "tries", toggleTry)}
        activeIcon={Check}
        idleIcon={Hand}
        label="써봤어요"
        count={state.tries}
      />
      <ReactionButton
        active={state.following}
        onClick={() => run("following", "follows", toggleFollow)}
        activeIcon={BellRing}
        idleIcon={Bell}
        label={state.following ? "관심 해제" : "관심 등록"}
        count={state.follows}
        title="관심 등록하면 이 프로젝트의 일정이 내 캘린더에 표시됩니다."
      />
      <ReactionButton
        active={state.liked}
        onClick={() => run("liked", "likes", toggleLike)}
        activeIcon={Heart}
        idleIcon={Heart}
        label="좋아요"
        count={state.likes}
        fillWhenActive
      />
    </div>
  );
}

function ReactionButton({
  active,
  onClick,
  activeIcon: ActiveIcon,
  idleIcon: IdleIcon,
  label,
  count,
  title,
  fillWhenActive,
}: {
  active: boolean;
  onClick: () => void;
  activeIcon: typeof Heart;
  idleIcon: typeof Heart;
  label: string;
  count: number;
  title?: string;
  fillWhenActive?: boolean;
}) {
  const Icon = active ? ActiveIcon : IdleIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-surface-muted"
      }`}
    >
      <Icon className="size-4" fill={active && fillWhenActive ? "currentColor" : "none"} aria-hidden />
      <span className="sr-only">{label}</span>
      {count}
    </button>
  );
}
