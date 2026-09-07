"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { notify } from "@/features/notification/create";

export type AdminUserState = { error: string | null; message: string | null };

const schema = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "MEMBER"]),
});

/**
 * 관리자 임명·해임.
 *
 * 부트스트랩(ADMIN_EMAILS)은 배포 직후 첫 관리자를 만드는 용도이고,
 * 그 뒤로 사람을 늘리고 줄이는 건 여기서 한다. 환경변수를 고치고 재배포해야만
 * 관리자를 바꿀 수 있으면 운영이 안 된다.
 */
export async function setUserRole(
  _prev: AdminUserState,
  form: FormData,
): Promise<AdminUserState> {
  const admin = await requireAdmin();

  const parsed = schema.safeParse({ userId: form.get("userId"), role: form.get("role") });
  if (!parsed.success) return { error: "요청이 올바르지 않습니다.", message: null };

  const { userId, role } = parsed.data;

  // 마지막 관리자가 스스로를 해임하면 아무도 신고 큐를 못 연다.
  if (role === "MEMBER") {
    if (userId === admin.id) {
      return { error: "본인을 해임할 수 없습니다. 다른 관리자에게 요청해주세요.", message: null };
    }
    const adminCount = await db.profile.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return { error: "마지막 관리자는 해임할 수 없습니다.", message: null };
    }
  }

  const target = await db.profile.findUnique({
    where: { userId },
    select: { displayName: true, role: true },
  });
  if (!target) return { error: "사용자를 찾을 수 없습니다.", message: null };
  if (target.role === role) return { error: null, message: "이미 그 권한입니다." };

  await db.profile.update({ where: { userId }, data: { role } });

  if (role === "ADMIN") {
    await notify({
      userId,
      type: "ADMIN_GRANTED",
      title: "관리자로 지정되었습니다",
      body: "신고 큐를 확인하고 다른 사람을 관리자로 임명할 수 있습니다.",
      url: "/admin/reports",
    });
  }

  revalidatePath("/admin/users");
  return {
    error: null,
    message: `${target.displayName} 님을 ${role === "ADMIN" ? "관리자로 임명" : "관리자에서 해임"}했습니다.`,
  };
}
