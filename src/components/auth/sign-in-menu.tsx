"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GithubMark } from "@/components/icons/github-mark";
import { signIn } from "@/lib/auth-client";
import type { ProviderId } from "@/lib/env";

const meta: Record<ProviderId, { label: string; className: string }> = {
  kakao: { label: "카카오", className: "bg-[#FEE500] text-[#191600] hover:brightness-95" },
  naver: { label: "네이버", className: "bg-[#03C75A] text-white hover:brightness-95" },
  google: { label: "Google", className: "border border-border bg-surface hover:bg-surface-muted" },
  github: { label: "GitHub", className: "bg-[#24292f] text-white hover:brightness-125" },
};

// 국내 사용자 비중을 생각해 카카오·네이버를 위로 올린다.
const order: ProviderId[] = ["kakao", "naver", "google", "github"];

/**
 * 오른쪽 위에서 바로 로그인한다.
 *
 * 별도 페이지로 보내면 보던 화면을 잃는다. 여기서 누르면 그 자리로 돌아온다.
 * 프로바이더가 하나도 설정되지 않았으면 그 사실을 여기서 알려준다 — 버튼만 없으면
 * 왜 로그인이 안 되는지 알 길이 없다.
 */
export function SignInMenu({ providers }: { providers: ProviderId[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ProviderId | null>(null);

  const available = order.filter((p) => providers.includes(p));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        로그인
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 top-10 z-20 w-64 rounded-xl border border-border bg-surface p-3 shadow-lg"
          >
            {available.length === 0 ? (
              <p className="p-1 text-xs text-muted-foreground">
                소셜 로그인이 설정되지 않았습니다. <code>.env</code> 에 프로바이더 자격증명을
                넣고 서버를 다시 시작해주세요.
              </p>
            ) : (
              <>
                <p className="px-1 pb-2 text-xs text-muted-foreground">계정으로 계속하기</p>
                <div className="flex flex-col gap-1.5">
                  {available.map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      disabled={pending !== null}
                      onClick={async () => {
                        setPending(provider);
                        try {
                          // 누른 자리로 돌아온다. 보던 화면을 잃지 않는다.
                          await signIn.social({
                            provider,
                            callbackURL: window.location.pathname + window.location.search,
                            // 실패하면 Better Auth 기본 화면 대신 무엇을 확인해야
                            // 하는지 적힌 우리 화면으로 보낸다.
                            errorCallbackURL: "/sign-in/error",
                          });
                        } finally {
                          setPending(null);
                          router.refresh();
                        }
                      }}
                      className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-60 ${meta[provider].className}`}
                    >
                      {provider === "github" ? <GithubMark className="size-4" /> : null}
                      {pending === provider ? "이동 중…" : meta[provider].label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
