"use client";

import { useState } from "react";

import { signIn } from "@/lib/auth-client";
import type { ProviderId } from "@/lib/env";

const meta: Record<ProviderId, { label: string; className: string }> = {
  kakao: {
    label: "카카오로 계속하기",
    className: "bg-[#FEE500] text-[#191600] hover:brightness-95",
  },
  naver: {
    label: "네이버로 계속하기",
    className: "bg-[#03C75A] text-white hover:brightness-95",
  },
  google: {
    label: "Google로 계속하기",
    className: "border border-border bg-surface hover:bg-surface-muted",
  },
  github: {
    label: "GitHub로 계속하기",
    className: "bg-[#24292f] text-white hover:brightness-125",
  },
};

// 국내 사용자 비중을 생각해 카카오·네이버를 위로 올린다.
const order: ProviderId[] = ["kakao", "naver", "google", "github"];

export function SignInButtons({
  providers,
  callbackURL,
}: {
  providers: ProviderId[];
  callbackURL: string;
}) {
  const [pending, setPending] = useState<ProviderId | null>(null);

  return (
    <div className="flex flex-col gap-2.5">
      {order
        .filter((p) => providers.includes(p))
        .map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={pending !== null}
            onClick={async () => {
              setPending(provider);
              try {
                await signIn.social({ provider, callbackURL });
              } finally {
                setPending(null);
              }
            }}
            className={`w-full rounded-xl px-4 py-3 text-sm font-medium transition disabled:opacity-60 ${meta[provider].className}`}
          >
            {pending === provider ? "이동 중…" : meta[provider].label}
          </button>
        ))}
    </div>
  );
}
