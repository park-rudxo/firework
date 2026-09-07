import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";
import { configuredProviders, serverEnv } from "@/lib/env";

const env = serverEnv();
const available = configuredProviders(env);

/**
 * 소셜 프로바이더는 자격증명이 채워진 것만 등록한다. 빈 문자열로 등록하면
 * 로그인 버튼은 뜨는데 누르면 프로바이더 쪽에서 깨지기 때문이다.
 */
const socialProviders: NonNullable<Parameters<typeof betterAuth>[0]["socialProviders"]> = {};

if (available.google) {
  socialProviders.google = {
    clientId: env.GOOGLE_CLIENT_ID!,
    clientSecret: env.GOOGLE_CLIENT_SECRET!,
  };
}
if (available.kakao) {
  socialProviders.kakao = {
    clientId: env.KAKAO_CLIENT_ID!,
    clientSecret: env.KAKAO_CLIENT_SECRET!,
  };
}
if (available.naver) {
  socialProviders.naver = {
    clientId: env.NAVER_CLIENT_ID!,
    clientSecret: env.NAVER_CLIENT_SECRET!,
  };
}
if (available.github) {
  socialProviders.github = {
    clientId: env.GITHUB_CLIENT_ID!,
    clientSecret: env.GITHUB_CLIENT_SECRET!,
  };
}

/**
 * GitHub 계정이 붙는 순간 로그인명을 받아 프로필에 새긴다.
 *
 * 이 값이 있어야 프로젝트를 등록할 수 있고(업로더 게이트), 저장소 소유권 검증의
 * 기준이 된다. 토큰이 없거나 GitHub 이 응답하지 않으면 조용히 넘어간다 —
 * 여기서 예외를 던지면 로그인 자체가 실패해버리기 때문이다.
 * 그 경우 사용자는 프로필 화면에서 다시 연결하면 된다.
 */
async function syncGithubLogin(userId: string, accessToken: string | null) {
  if (!accessToken) return;
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return;
    const profile = (await res.json()) as { login?: unknown };
    if (typeof profile.login !== "string" || !profile.login) return;

    await db.profile.updateMany({
      where: { userId },
      data: { githubLogin: profile.login },
    });
  } catch {
    // 로그인 흐름을 막지 않는다.
  }
}

export const auth = betterAuth({
  appName: "firework",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: { enabled: false },

  socialProviders,

  account: {
    accountLinking: {
      enabled: true,
      /**
       * trustedProviders 에 든 프로바이더는 이메일 검증 여부를 확인해주지 않아도
       * 같은 이메일이면 기존 계정에 자동으로 붙는다. 즉 어떤 프로바이더에서
       * 이메일을 위조할 수 있으면 그대로 계정 탈취가 된다.
       *
       * 그래서 이메일 검증이 확실한 Google·GitHub 만 신뢰하고,
       * Kakao·Naver 는 이미 로그인한 상태에서 사용자가 직접 누르는
       * linkSocial 플로우로만 연결되게 둔다.
       */
      trustedProviders: ["google", "github"],
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30일
    updateAge: 60 * 60 * 24, // 하루 지나면 갱신
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // 프로필은 서비스 쪽 테이블이라 Better Auth 가 만들어주지 않는다.
          await db.profile.create({
            data: { userId: user.id, displayName: user.name || "익명" },
          });
        },
      },
    },
    account: {
      create: {
        after: async (account) => {
          if (account.providerId !== "github") return;
          await syncGithubLogin(account.userId, account.accessToken ?? null);
        },
      },
    },
  },

  // Server Action 안에서 쿠키가 제대로 설정되게 한다. Next.js 에서는 사실상 필수다.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
