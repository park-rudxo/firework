import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { configuredProviders, serverEnv } from "@/lib/env";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "로그인" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const viewer = await getViewer();
  if (viewer) redirect(safeNext(next));

  const providers = configuredProviders(serverEnv());
  const enabled = (Object.keys(providers) as (keyof typeof providers)[]).filter(
    (p) => providers[p],
  );

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20">
      <Sparkles className="size-8 text-primary" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">firework 로그인</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        둘러보기·설문·추첨 참여는 아무 계정으로나 가능합니다.
        <br />
        프로젝트를 등록하려면 나중에 GitHub 계정 연결이 필요합니다.
      </p>

      <div className="mt-8 w-full">
        {enabled.length === 0 ? (
          <p className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
            소셜 로그인이 하나도 설정되지 않았습니다. <code>.env</code> 에 프로바이더 자격증명을
            채워주세요.
          </p>
        ) : (
          <SignInButtons providers={enabled} callbackURL={safeNext(next)} />
        )}
      </div>

      {/* 가입 시점에 무엇에 동의하는지 알 수 있어야 한다. 소셜 로그인 심사에서도 확인하는 항목이다. */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        로그인하면{" "}
        <Link href="/about/terms" className="underline">
          이용약관
        </Link>
        과{" "}
        <Link href="/about/privacy" className="underline">
          개인정보처리방침
        </Link>
        에 동의하는 것으로 봅니다.
      </p>
    </div>
  );
}

/**
 * 로그인 후 돌아갈 곳. 외부 도메인으로 튕겨보내는 오픈 리다이렉트를 막기 위해
 * 사이트 내부 경로만 허용한다.
 */
function safeNext(next: string | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
