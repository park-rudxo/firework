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
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
