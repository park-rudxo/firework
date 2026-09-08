import { cache } from "react";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export type Viewer = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  displayName: string;
  githubLogin: string | null;
  isAdmin: boolean;
  /**
   * 이메일이 확인됐는지. 프로바이더가 검증해준 경우(Google·GitHub·Kakao)와
   * 우리가 코드로 확인한 경우를 같은 값으로 둔다. 네이버는 Better Auth 가
   * emailVerified 를 항상 false 로 주므로 사실상 우리 인증을 한 번 거친다.
   */
  emailVerified: boolean;
};

/**
 * 한 요청 안에서 여러 서버 컴포넌트가 세션을 물어봐도 DB 는 한 번만 친다.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
    select: { displayName: true, githubLogin: true, role: true },
  });

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
    displayName: profile?.displayName ?? session.user.name,
    githubLogin: profile?.githubLogin ?? null,
    isAdmin: profile?.role === "ADMIN",
    emailVerified: Boolean(session.user.emailVerified),
  };
});

/** 로그인이 필요한 Server Action 용. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new Error("로그인이 필요합니다.");
  return viewer;
}

/**
 * 프로젝트를 올리려면 GitHub 계정 연결이 필수다.
 *
 * UI 에서 게이트를 걸어두더라도 Server Action 은 직접 호출될 수 있으므로
 * 실제 방어는 여기서 한다.
 */
export async function requireGithubLinkedViewer(): Promise<Viewer & { githubLogin: string }> {
  const viewer = await requireVerifiedViewer();
  if (!viewer.githubLogin) {
    throw new Error("프로젝트를 등록하려면 GitHub 계정 연결이 필요합니다.");
  }
  return viewer as Viewer & { githubLogin: string };
}

/**
 * 이메일 확인까지 끝난 사람만 통과시킨다.
 *
 * 설문 응답과 추첨 응모, 프로젝트 등록처럼 계정을 여러 개 만들면 이득이 생기는
 * 곳에만 건다. 둘러보기나 좋아요까지 막으면 얻는 것 없이 진입만 막힌다.
 */
export async function requireVerifiedViewer(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.emailVerified) {
    throw new Error("이메일 확인이 필요합니다. 설정에서 인증을 마쳐주세요.");
  }
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) throw new Error("관리자만 접근할 수 있습니다.");
  return viewer;
}
