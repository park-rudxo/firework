import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Mail } from "lucide-react";

import { VerifyEmailForm } from "@/components/verification/verify-email-form";
import { serverEnv } from "@/lib/env";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "이메일 확인" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/verify-email");

  const back = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (viewer.emailVerified) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <CheckCircle2 className="mx-auto size-9 text-success" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">이미 확인된 이메일입니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">{viewer.email}</p>
        <Link
          href={back}
          className="mt-8 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Mail className="size-8 text-primary" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold">이메일을 한 번만 확인할게요</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        <strong className="text-foreground">{viewer.email}</strong> 으로 6자리 코드를 보냅니다.
        설문 응답과 추첨 응모, 프로젝트 등록에 필요합니다. 둘러보기는 확인 없이도 됩니다.
      </p>

      <div className="mt-8">
        <VerifyEmailForm
          email={viewer.email}
          back={back}
          deliveryConfigured={Boolean(serverEnv().RESEND_API_KEY)}
        />
      </div>
    </div>
  );
}
