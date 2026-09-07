import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          firework — SSAFY 프로젝트 공유 플랫폼. 설문 응답은{" "}
          <Link href="/about/anonymity" className="underline underline-offset-2">
            제작자에게도 익명
          </Link>
          으로 전달됩니다.
        </p>
        <nav className="flex gap-4">
          <Link href="/about/anonymity" className="hover:text-foreground">
            익명성 정책
          </Link>
          <Link href="/about/reporting" className="hover:text-foreground">
            신고 정책
          </Link>
        </nav>
      </div>
    </footer>
  );
}
