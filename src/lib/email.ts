import "server-only";

import { serverEnv } from "@/lib/env";

export type Delivery = { ok: true } | { ok: false; error: string };

/**
 * 인증 메일 발송.
 *
 * RESEND_API_KEY 가 없으면 실패로 두지 않고 서버 콘솔에 코드를 찍는다.
 * 키 발급 전에도 흐름 전체를 돌려볼 수 있어야 하기 때문이다.
 * 대신 화면에도 "콘솔을 보라"고 알려서, 메일이 안 온다고 헤매지 않게 한다.
 */
export async function sendVerificationEmail(to: string, code: string): Promise<Delivery> {
  const env = serverEnv();

  if (!env.RESEND_API_KEY) {
    console.log(
      `\n[메일 발송 미설정] ${to} 으로 보낼 인증 코드: ${code}\n` +
        `실제로 보내려면 .env 에 RESEND_API_KEY 를 넣으세요. https://resend.com/api-keys\n`,
    );
    return { ok: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.RESEND_API_KEY);

    const { error } = await resend.emails.send({
      // 도메인을 붙이기 전에는 Resend 의 테스트 발신 주소를 그대로 쓸 수 있다.
      from: env.EMAIL_FROM || "firework <onboarding@resend.dev>",
      to,
      subject: `[firework] 인증 코드 ${code}`,
      text: [
        `인증 코드: ${code}`,
        "",
        "firework 에서 이메일 확인을 위해 보낸 코드입니다. 10분 뒤 만료됩니다.",
        "본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.",
      ].join("\n"),
    });

    if (error) {
      console.error("[메일 발송 실패]", error);
      return { ok: false, error: "메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[메일 발송 실패]", err);
    return { ok: false, error: "메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요." };
  }
}
