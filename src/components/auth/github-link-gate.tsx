"use client";

import { useState } from "react";
import { GithubMark } from "@/components/icons/github-mark";
import { linkSocial } from "@/lib/auth-client";

/**
 * 카카오·네이버·구글로 가입한 사람이 프로젝트를 올리려 할 때 만나는 화면.
 * 로그아웃했다 GitHub 으로 다시 로그인하는 게 아니라, 지금 계정에 GitHub 을 덧붙인다.
 */
export function GithubLinkGate({ githubConfigured }: { githubConfigured: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <GithubMark className="mx-auto size-9" />
      <h1 className="mt-4 text-xl font-semibold">GitHub 계정 연결이 필요합니다</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        프로젝트를 등록하려면 GitHub 계정을 연결해주세요. 저장소가 정말 본인 것인지 확인하는 데
        쓰이고, 확인되면 프로젝트에 <strong className="text-foreground">소유 확인</strong> 배지가
        붙습니다.
        <br />
        <br />
        지금 로그인한 계정은 그대로 유지되고, GitHub 이 하나 더 연결될 뿐입니다.
      </p>

      {!githubConfigured ? (
        <p className="mt-6 rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          GitHub 로그인이 서버에 설정되어 있지 않습니다. 관리자에게 문의해주세요.
        </p>
      ) : (
        <>
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
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#24292f] px-5 py-3 text-sm font-medium text-white transition disabled:opacity-60"
          >
            <GithubMark className="size-4" />
            {pending ? "이동 중…" : "GitHub 계정 연결하기"}
          </button>
          {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        </>
      )}
    </div>
  );
}
