"use client";

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

export function SignInButtons({
  providers,
  missing,
  callbackURL,
}: {
  providers: ProviderId[];
  /** 자격증명이 없어 뜨지 않는 프로바이더. 개발 환경에서만 채워 보낸다. */
  missing?: ProviderId[];
  callbackURL: string;
}) {
  const [pending, setPending] = useState<ProviderId | null>(null);

  return (
    <div className="flex flex-col gap-2.5">
      {PROVIDER_ORDER.filter((p) => providers.includes(p)).map((provider) => (
        <button
          key={provider}
          type="button"
          disabled={pending !== null}
          onClick={async () => {
            setPending(provider);
            try {
              await signIn.social({
                provider,
                callbackURL,
                errorCallbackURL: "/sign-in/error",
              });
            } finally {
              setPending(null);
            }
          }}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition disabled:opacity-60 ${PROVIDER_BUTTON_CLASS[provider]}`}
        >
          {provider === "github" ? <GithubMark className="size-4" /> : null}
          {pending === provider ? "이동 중…" : `${PROVIDER_LABEL[provider]}로 계속하기`}
        </button>
      ))}

      {missing && missing.length > 0 ? <ProviderSetupHint missing={missing} /> : null}
    </div>
  );
}
