"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GithubMark } from "@/components/icons/github-mark";
import { signIn } from "@/lib/auth-client";
import {
  PROVIDER_BUTTON_CLASS,
  PROVIDER_LABEL,
  PROVIDER_ORDER,
  type ProviderId,
} from "@/lib/providers";
import { ProviderSetupHint } from "@/components/auth/provider-setup-hint";

/**
 * 오른쪽 위에서 바로 로그인한다.
 *
 * 별도 페이지로 보내면 보던 화면을 잃는다. 여기서 누르면 그 자리로 돌아온다.
 * 프로바이더가 하나도 설정되지 않았으면 그 사실을 여기서 알려준다 — 버튼만 없으면
 * 왜 로그인이 안 되는지 알 길이 없다.
 */
export function SignInMenu({
  providers,
  missing = [],
}: {
  providers: ProviderId[];
  /** 자격증명이 없어 뜨지 않는 프로바이더. 개발 환경에서만 채워 보낸다. */
  missing?: ProviderId[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ProviderId | null>(null);

  const available = PROVIDER_ORDER.filter((p) => providers.includes(p));

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
            className="absolute right-0 top-10 z-20 max-h-[80vh] w-72 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-lg"
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
                      className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-60 ${PROVIDER_BUTTON_CLASS[provider]}`}
                    >
                      {provider === "github" ? <GithubMark className="size-4" /> : null}
                      {pending === provider ? "이동 중…" : PROVIDER_LABEL[provider]}
                    </button>
                  ))}
                </div>
              </>
            )}

            {missing.length > 0 ? <ProviderSetupHint missing={missing} /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
