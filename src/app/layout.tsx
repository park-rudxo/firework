import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "firework — SSAFY 프로젝트 공유 플랫폼",
    template: "%s · firework",
  },
  description:
    "SSAFY에서 만든 프로젝트를 모아 보고, 직접 써보고, 익명으로 피드백을 남기고, 경품 추첨에 응모하세요.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
