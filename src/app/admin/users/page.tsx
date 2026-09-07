import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, ShieldCheck } from "lucide-react";

import { RoleForm } from "@/components/admin/role-form";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "관리자 관리" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/admin/users");
  if (!viewer.isAdmin) redirect("/");

  const query = q?.trim();

  const [admins, results] = await Promise.all([
    db.profile.findMany({
      where: { role: "ADMIN" },
      orderBy: { displayName: "asc" },
      select: { userId: true, displayName: true, user: { select: { email: true } } },
    }),
    query
      ? db.profile.findMany({
          where: {
            OR: [
              { displayName: { contains: query, mode: "insensitive" } },
              { user: { email: { contains: query, mode: "insensitive" } } },
              { githubLogin: { contains: query, mode: "insensitive" } },
            ],
          },
          take: 20,
          select: {
            userId: true,
            displayName: true,
            role: true,
            githubLogin: true,
            user: { select: { email: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">관리자 관리</h1>
        <Link href="/admin/reports" className="text-sm text-muted-foreground underline">
          신고 큐
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <ShieldCheck className="size-5 text-success" aria-hidden />
          현재 관리자 {admins.length}명
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {admins.map((a) => (
            <li
              key={a.userId}
              className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-sm"
            >
              <span className="font-medium">{a.displayName}</span>
              <span className="text-muted-foreground">{a.user.email}</span>
              <div className="ml-auto">
                <RoleForm
                  userId={a.userId}
                  role="MEMBER"
                  label="해임"
                  disabled={a.userId === viewer.id || admins.length <= 1}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          본인은 해임할 수 없고, 마지막 관리자도 해임할 수 없습니다. 아무도 신고 큐를 못 여는
          상태가 되기 때문입니다.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">사용자 찾기</h2>

        <form action="/admin/users" className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={query ?? ""}
            placeholder="이름, 이메일, GitHub 계정"
            aria-label="사용자 검색"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </form>

        {query ? (
          results.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">일치하는 사용자가 없습니다.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {results.map((u) => (
                <li
                  key={u.userId}
                  className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-sm"
                >
                  <span className="font-medium">{u.displayName}</span>
                  <span className="text-muted-foreground">{u.user.email}</span>
                  {u.githubLogin ? (
                    <span className="text-xs text-muted-foreground">@{u.githubLogin}</span>
                  ) : null}
                  <div className="ml-auto">
                    {u.role === "ADMIN" ? (
                      <span className="text-xs text-success">관리자</span>
                    ) : (
                      <RoleForm userId={u.userId} role="ADMIN" label="관리자로 임명" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>
    </div>
  );
}
