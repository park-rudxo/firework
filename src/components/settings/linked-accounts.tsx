"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, RefreshCw } from "lucide-react";

import { GithubMark } from "@/components/icons/github-mark";
import { linkSocial } from "@/lib/auth-client";
import { syncGithubLogin } from "@/features/profile/actions";
import type { ProviderId } from "@/lib/env";

const LABEL: Record<ProviderId, string> = {
  google: "Google",
  kakao: "카카오",
  naver: "네이버",
  github: "GitHub",
};

export function LinkedAccounts({
  linked,
  available,
  githubLogin,
}: {
  linked: string[];
  available: Record<ProviderId, boolean>;
  githubLogin: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, startSync] = useTransition();

  const providers = (Object.keys(LABEL) as ProviderId[]).filter((p) => available[p]);
  const githubLinked = linked.includes("github");

  return (
    <div className="flex flex-col gap-2">
      {providers.map((provider) => {
        const isLinked = linked.includes(provider);
        return (
          <div
            key={provider}
            className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3"
          >
            {provider === "github" ? <GithubMark className="size-4" /> : null}
            <span className="text-sm font-medium">{LABEL[provider]}</span>

            {isLinked ? (
              <span className="flex items-center gap-1 text-xs text-success">
                <BadgeCheck className="size-3.5" aria-hidden />
                연결됨
                {provider === "github" && githubLogin ? (
                  <span className="text-muted-foreground"> @{githubLogin}</span>
                ) : null}
              </span>
            ) : null}

            {!isLinked ? (
              <button
                type="button"
                disabled={pending !== null}
                onClick={async () => {
                  setPending(provider);
                  setError(null);
                  try {
                    await linkSocial({ provider, callbackURL: "/settings/profile" });
                  } catch {
                    setError("연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
                    setPending(null);
                  }
                }}
                className="ml-auto rounded-xl border border-border px-3.5 py-2 text-sm disabled:opacity-60"
              >
                {pending === provider ? "이동 중…" : "연결하기"}
              </button>
            ) : null}
          </div>
        );
      })}

      {githubLinked && !githubLogin ? (
        <div className="rounded-card border border-accent/40 bg-accent/5 p-4">
          <p className="text-sm">
            GitHub 은 연결됐는데 계정 이름을 받아오지 못했습니다. 프로젝트를 등록하려면 이 값이
            필요합니다.
          </p>
          <button
            type="button"
            disabled={syncing}
            onClick={() =>
              startSync(async () => {
                const result = await syncGithubLogin();
                if (result.error) setError(result.error);
                else router.refresh();
              })
            }
            className="mt-3 flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />
            {syncing ? "가져오는 중…" : "다시 가져오기"}
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
