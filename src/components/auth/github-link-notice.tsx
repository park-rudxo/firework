"use client";

import { useState } from "react";
import { GithubMark } from "@/components/icons/github-mark";
import { linkSocial } from "@/lib/auth-client";

/**
 * 카카오·네이버·구글로 가입한 사람이 프로젝트 등록 화면에서 보는 안내.
 *
 * 예전에는 이 화면이 등록 자체를 막는 관문이었다. 하지만 공유할 만한 프로젝트가
 * 전부 공개 저장소를 가진 것은 아니다 — 배포된 웹서비스나 스토어에 올린 앱은
 * GitHub 과 아무 상관이 없는데도 등록을 못 하는 상태였다.
 *
 * 그래서 관문이 아니라 안내로 바꿨다. 저장소를 붙이려는 사람에게만 필요한 절차다.
 * 로그아웃했다 GitHub 으로 다시 로그인하는 게 아니라, 지금 계정에 GitHub 을 덧붙인다.
 */
export function GithubLinkNotice({ githubConfigured }: { githubConfigured: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-card border border-border bg-surface-muted p-4">
      <div className="flex flex-wrap items-center gap-3">
        <GithubMark className="size-5" />
        <p className="min-w-0 flex-1 text-sm">
          <strong className="font-medium">GitHub 저장소를 함께 올리시려면</strong> 계정을
          연결해주세요. 저장소가 본인 것인지 확인해{" "}
          <strong className="font-medium">소유 확인</strong> 배지를 붙이는 데 쓰입니다.
          <br />
          <span className="text-muted-foreground">
            저장소 없이 서비스 주소만으로 등록하실 거라면 연결하지 않으셔도 됩니다.
          </span>
        </p>

        {githubConfigured ? (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                await linkSocial({ provider: "github", callbackURL: "/projects/new" });
              } catch {
                setError("연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
                setPending(false);
              }
            }}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#24292f] px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-60"
          >
            <GithubMark className="size-4" />
            {pending ? "이동 중…" : "GitHub 연결"}
          </button>
        ) : null}
      </div>

      {!githubConfigured ? (
        <p className="mt-3 text-sm text-danger">
          GitHub 로그인이 서버에 설정되어 있지 않아 저장소 연결을 쓸 수 없습니다. 서비스 주소만으로
          등록해주세요.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
