"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, BellOff, BellRing, Check, Loader2 } from "lucide-react";
import type { ProjectNotificationTopic } from "@prisma/client";

import { setNotificationTopics, setSubscription } from "@/features/subscription/actions";

const TOPICS: { id: ProjectNotificationTopic; label: string; hint: string }[] = [
  { id: "UPDATE", label: "업데이트·진행 소식", hint: "새 버전, 기능 추가, 출시 소식" },
  { id: "RECRUITING", label: "참여 모집", hint: "베타 테스트, 설문, 이벤트" },
];

/**
 * 구독 버튼과 알림 버튼.
 *
 * 유튜브의 구독 / 🔔 과 같은 관계다. 구독은 관심 목록에 담는 것이고, 알림은 밖으로
 * 메시지를 받겠다는 별개의 허락이다. 그래서 버튼도 둘이다 — 하나로 합치면 "관심은
 * 있는데 알림은 싫다" 를 표현할 방법이 없어진다.
 *
 * **알림 기본값은 전부 꺼짐이다.** 구독을 눌러도 알림 패널은 아무것도 켜지지 않은 채
 * 열린다. 대부분은 알림을 반기지 않으므로 켜는 쪽이 명시적인 행동이어야 한다.
 */
export function SubscribeControls({
  slug,
  initialSubscribed,
  initialTopics,
  subscriberCount,
  signedIn,
  mattermostLinked,
}: {
  slug: string;
  initialSubscribed: boolean;
  initialTopics: ProjectNotificationTopic[];
  subscriberCount: number;
  signedIn: boolean;
  /** Mattermost 를 연결하지 않았으면 사이트 알림만 간다는 것을 알려준다. */
  mattermostLinked: boolean;
}) {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [topics, setTopics] = useState<ProjectNotificationTopic[]>(initialTopics);
  const [count, setCount] = useState(subscriberCount);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const requireSignIn = () => {
    router.push(`/sign-in?next=${encodeURIComponent(`/projects/${slug}`)}`);
  };

  const toggleSubscribe = () => {
    if (!signedIn) return requireSignIn();

    const next = !subscribed;
    setSubscribed(next);
    setCount((c) => c + (next ? 1 : -1));
    // 구독을 끊으면 알림도 함께 꺼진다. 서버도 같은 일을 하지만, 화면이 먼저
    // 그렇게 보여야 사용자가 "알림이 남아 있나?" 를 의심하지 않는다.
    if (!next) {
      setTopics([]);
      setOpen(false);
    }

    startTransition(async () => {
      try {
        await setSubscription(slug, next);
      } catch {
        setSubscribed(!next);
        setCount((c) => c + (next ? -1 : 1));
        setTopics(initialTopics);
      }
    });
  };

  const toggleTopic = (topic: ProjectNotificationTopic) => {
    const next = topics.includes(topic) ? topics.filter((t) => t !== topic) : [...topics, topic];
    const before = topics;
    setTopics(next);

    startTransition(async () => {
      try {
        await setNotificationTopics(slug, next);
      } catch {
        setTopics(before);
      }
    });
  };

  const BellIcon = topics.length > 0 ? BellRing : Bell;

  return (
    <div className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggleSubscribe}
        aria-pressed={subscribed}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
          subscribed
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-surface-muted"
        }`}
      >
        {subscribed ? <Check className="size-4" aria-hidden /> : null}
        {subscribed ? "구독 중" : "구독"}
        <span className="text-xs opacity-70">{count}</span>
      </button>

      {subscribed ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={topics.length > 0 ? "알림 켜짐" : "알림 꺼짐"}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
            topics.length > 0
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-surface-muted"
          }`}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <BellIcon className="size-4" aria-hidden />
          )}
          <span className="sr-only">알림 설정</span>
        </button>
      ) : null}

      {open && subscribed ? (
        <div
          role="dialog"
          aria-label="알림 설정"
          className="absolute right-0 top-full z-20 mt-2 w-72 rounded-card border border-border bg-surface p-4 shadow-lg"
        >
          <p className="text-sm font-medium">어떤 소식을 받을까요?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            기본은 꺼짐입니다. 켠 것만 알림으로 갑니다.
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {TOPICS.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl p-2 hover:bg-surface-muted">
                  <input
                    type="checkbox"
                    checked={topics.includes(t.id)}
                    onChange={() => toggleTopic(t.id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {topics.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                const before = topics;
                setTopics([]);
                startTransition(async () => {
                  try {
                    await setNotificationTopics(slug, []);
                  } catch {
                    setTopics(before);
                  }
                });
              }}
              className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <BellOff className="size-3.5" aria-hidden />
              알림 전부 끄기
            </button>
          ) : null}

          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            {mattermostLinked
              ? "켜두면 사이트 알림과 Mattermost 메시지로 갑니다."
              : "지금은 사이트 알림으로만 옵니다. Mattermost 로도 받으려면 설정에서 계정을 연결해주세요."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
