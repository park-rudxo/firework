import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getViewer } from "@/lib/session";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "firework — SSAFY 프로젝트 공유 플랫폼",
    template: "%s · firework",
  },
  description:
    "SSAFY에서 만든 프로젝트를 모아 보고, 직접 써보고, 익명으로 피드백을 남기고, 경품 추첨에 응모하세요.",
};

/**
 * 닉네임을 정하지 않아도 열리는 곳.
 *
 * 게이트 자신(/nickname)을 빼지 않으면 리다이렉트가 무한히 돈다. 로그인·이메일 확인은
 * 같은 가입 흐름이라 서로를 막으면 안 되고, 정책 문서(/about)는 익명성과 신고 기준을
 * 설명하는 글이라 아무 때나 읽을 수 있어야 한다.
 */
const NICKNAME_EXEMPT = ["/nickname", "/sign-in", "/verify-email", "/about"];

/**
 * 닉네임 형식을 갖추지 않은 사람을 /nickname 으로 보낸다.
 *
 * 소셜 로그인만 있어서 가입 폼이 없다. 그래서 "가입할 때 받는다" 를 구현할 자리가
 * 여기밖에 없다 — 첫 로그인 뒤 처음 그리는 화면에서 붙잡는다. 이미 가입한 사람도
 * 같은 길을 지나므로 결국 전원이 같은 형식이 된다.
 *
 * 여기는 화면 게이트다. Server Action 은 라우트를 거치지 않고 직접 호출될 수 있으므로
 * 실제 방어는 lib/session.ts 의 requireNamedViewer 가 한 번 더 한다.
 */
async function nicknameGate() {
  const viewer = await getViewer();
  if (!viewer || viewer.nicknameSet) return;

  // 경로는 proxy.ts 가 얹어준다. 레이아웃은 경로를 알 방법이 따로 없다.
  const pathname = (await headers()).get("x-pathname") ?? "/";
  if (NICKNAME_EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return;

  redirect(`/nickname?next=${encodeURIComponent(pathname)}`);
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  await nicknameGate();

  return (
    /**
     * suppressHydrationWarning 은 <html> 에만 건다.
     *
     * 브라우저 확장이 React 가 로드되기 전에 <html> 에 속성을 끼워넣는 일이 흔하다
     * (한글 뷰어 확장의 data-hwp-extension, 다크모드·번역 확장 등). 그러면 서버가 그린
     * HTML 과 어긋나 하이드레이션 경고가 뜨는데, 우리가 고칠 수 있는 것이 아니면서
     * 콘솔을 채워 진짜 문제를 가린다.
     *
     * 이 속성은 해당 엘리먼트 한 겹에만 적용되고 자식은 그대로 검사된다. 여기 <html> 은
     * lang 과 className 이 전부 고정값이라 가려질 진짜 불일치가 없다.
     */
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
