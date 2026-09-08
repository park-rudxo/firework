"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, LogOut, Plus, ShieldCheck, User as UserIcon } from "lucide-react";

import { SignInMenu } from "@/components/auth/sign-in-menu";
import { signOut } from "@/lib/auth-client";
import type { ProviderId } from "@/lib/env";
import type { Viewer } from "@/lib/session";

export function UserMenu({
  viewer,
  providers,
}: {
  viewer: Viewer | null;
  providers: ProviderId[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!viewer) return <SignInMenu providers={providers} />;

  return (
    <div className="relative flex items-center gap-2">
      <Link
        href="/projects/new"
        className="hidden items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-surface-muted sm:flex"
      >
        <Plus className="size-4" aria-hidden />
        프로젝트 등록
      </Link>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-muted"
      >
        {viewer.image ? (
          // 아바타는 외부 호스트(구글/카카오/깃허브)에서 오고 목록도 유동적이라
          // next/image 대신 평범한 img 로 둔다.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewer.image} alt="" className="size-full object-cover" />
        ) : (
          <UserIcon className="size-4" aria-hidden />
        )}
        <span className="sr-only">{viewer.displayName} 메뉴</span>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
          >
            <div className="border-b border-border px-3.5 py-3">
              <p className="truncate text-sm font-medium">{viewer.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{viewer.email}</p>
              {!viewer.emailVerified ? (
                <Link
                  href="/verify-email"
                  onClick={() => setOpen(false)}
                  className="mt-2 block rounded-lg bg-accent/10 px-2 py-1.5 text-xs text-accent"
                >
                  이메일 확인이 필요합니다 →
                </Link>
              ) : null}
            </div>

            <MenuLink href="/dashboard" icon={LayoutDashboard} onClick={() => setOpen(false)}>
              대시보드
            </MenuLink>
            <MenuLink href="/settings/profile" icon={UserIcon} onClick={() => setOpen(false)}>
              프로필 설정
            </MenuLink>
            {viewer.isAdmin ? (
              <>
                <MenuLink href="/admin/reports" icon={ShieldCheck} onClick={() => setOpen(false)}>
                  신고 관리
                </MenuLink>
                <MenuLink href="/admin/users" icon={ShieldCheck} onClick={() => setOpen(false)}>
                  관리자 관리
                </MenuLink>
              </>
            ) : null}

            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await signOut();
                router.refresh();
              }}
              className="flex w-full items-center gap-2 border-t border-border px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <LogOut className="size-4" aria-hidden />
              로그아웃
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  children,
  onClick,
}: {
  href: string;
  icon: typeof UserIcon;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2 px-3.5 py-2.5 text-sm transition-colors hover:bg-surface-muted"
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </Link>
  );
}
