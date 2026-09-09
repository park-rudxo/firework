import { cache } from "react";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isValidNickname, NICKNAME_EXAMPLE, NICKNAME_FORMAT } from "@/features/profile/nickname";

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
  /**
   * 닉네임이 기수_지역_반_이름 형식을 갖췄는지.
   *
   * 소셜 로그인만 있어서 가입 폼이 없다. 프로바이더가 준 이름이 그대로 들어오므로
   * 새로 가입한 사람은 항상 false 로 시작하고, 레이아웃이 /nickname 으로 보낸다.
   */
  nicknameSet: boolean;
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

  const displayName = profile?.displayName ?? session.user.name;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
    displayName,
    githubLogin: profile?.githubLogin ?? null,
    isAdmin: profile?.role === "ADMIN",
    emailVerified: Boolean(session.user.emailVerified),
    nicknameSet: isValidNickname(displayName),
  };
});

/** 로그인이 필요한 Server Action 용. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new Error("로그인이 필요합니다.");
  return viewer;
}

/**
 * 닉네임을 형식에 맞게 정한 사람만 통과시킨다.
 *
 * 설문 응답과 추첨 응모, 프로젝트 등록처럼 계정을 여러 개 만들면 이득이 생기는 곳에
 * 이 게이트가 선다. 예전에는 여기에 이메일 확인도 함께 걸었는데, 닉네임이
 * 기수_지역_반_이름 이라 계정을 여러 개 만들려면 실명과 소속을 그만큼 써내야 한다.
 * 같은 반 사람들이 보는 화면에서 그건 이메일 인증보다 강한 억제다.
 * 반대로 이메일 확인은 카카오처럼 이메일을 주지 않는 프로바이더를 통째로 막았다.
 *
 * 화면에서는 레이아웃이 /nickname 으로 돌려보내지만, Server Action 은 라우트를
 * 거치지 않고 직접 호출될 수 있으므로 실제 방어는 여기서 한다.
 */
export async function requireNamedViewer(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.nicknameSet) {
    throw new Error(
      `닉네임을 ${NICKNAME_FORMAT} 형식으로 먼저 정해주세요. 예) ${NICKNAME_EXAMPLE}`,
    );
  }
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) throw new Error("관리자만 접근할 수 있습니다.");
  return viewer;
}
