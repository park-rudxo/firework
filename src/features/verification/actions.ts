"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { sendVerificationEmail } from "@/lib/email";
import { requireViewer } from "@/lib/session";
import {
  CODE_TTL_MS,
  checkCode,
  cooldownRemainingMs,
  generateCode,
  identifierFor,
  newPayload,
  parsePayload,
  serialize,
} from "@/features/verification/code";

export type VerifyState = { error: string | null; sent: boolean; verified: boolean };

export async function sendEmailVerificationCode(
  _prev: VerifyState,
  _form: FormData,
): Promise<VerifyState> {
  const viewer = await requireViewer();

  const user = await db.user.findUnique({
    where: { id: viewer.id },
    select: { email: true, emailVerified: true },
  });
  if (!user) return { error: "사용자를 찾을 수 없습니다.", sent: false, verified: false };
  if (user.emailVerified) return { error: null, sent: false, verified: true };

  const identifier = identifierFor(viewer.id);
  const existing = await db.verification.findFirst({
    where: { identifier },
    orderBy: { createdAt: "desc" },
  });

  const previous = existing ? parsePayload(existing.value) : null;
  if (previous) {
    const waitMs = cooldownRemainingMs(previous);
    if (waitMs > 0) {
      return {
        error: `${Math.ceil(waitMs / 1000)}초 뒤에 다시 보낼 수 있습니다.`,
        sent: false,
        verified: false,
      };
    }
  }

  const code = generateCode();

  await db.verification.deleteMany({ where: { identifier } });
  await db.verification.create({
    data: {
      id: crypto.randomUUID(),
      identifier,
      value: serialize(newPayload(code)),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  const delivered = await sendVerificationEmail(user.email, code);
  if (!delivered.ok) return { error: delivered.error, sent: false, verified: false };

  return { error: null, sent: true, verified: false };
}

const codeSchema = z.string().trim().regex(/^\d{6}$/, "6자리 숫자를 입력해주세요.");

export async function confirmEmailVerificationCode(
  _prev: VerifyState,
  form: FormData,
): Promise<VerifyState> {
  const viewer = await requireViewer();

  const parsed = codeSchema.safeParse(form.get("code"));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "코드를 확인해주세요.",
      sent: true,
      verified: false,
    };
  }

  const identifier = identifierFor(viewer.id);
  const record = await db.verification.findFirst({
    where: { identifier },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return { error: "코드를 먼저 발송해주세요.", sent: false, verified: false };

  const payload = parsePayload(record.value);
  if (!payload) {
    await db.verification.deleteMany({ where: { identifier } });
    return { error: "코드가 손상되었습니다. 다시 발송해주세요.", sent: false, verified: false };
  }

  const result = checkCode(parsed.data, payload, record.expiresAt);

  switch (result.status) {
    case "expired":
      await db.verification.deleteMany({ where: { identifier } });
      return { error: "코드가 만료되었습니다. 다시 발송해주세요.", sent: false, verified: false };

    case "locked":
      await db.verification.deleteMany({ where: { identifier } });
      return { error: "시도 횟수를 넘었습니다. 코드를 다시 발송해주세요.", sent: false, verified: false };

    case "mismatch":
      await db.verification.update({
        where: { id: record.id },
        data: { value: serialize(result.next) },
      });
      return {
        error:
          result.attemptsLeft > 0
            ? `코드가 맞지 않습니다. ${result.attemptsLeft}번 더 시도할 수 있습니다.`
            : "시도 횟수를 넘었습니다. 다시 발송해주세요.",
        sent: true,
        verified: false,
      };

    case "ok":
      await db.$transaction([
        db.user.update({ where: { id: viewer.id }, data: { emailVerified: true } }),
        db.verification.deleteMany({ where: { identifier } }),
      ]);
      // 헤더의 "이메일 확인 필요" 배지가 바로 사라져야 한다.
      revalidatePath("/", "layout");
      return { error: null, sent: false, verified: true };
  }
}

/** 개발 중 메일 발송이 설정돼 있지 않으면 화면에 그렇게 적어준다. */
export async function emailDeliveryConfigured(): Promise<boolean> {
  return Boolean(serverEnv().RESEND_API_KEY);
}
