import Link from "next/link";

// Phase 3 에서 큐레이션 섹션(주간 인기 · 최근 출시 · 최근 업데이트 …)으로 대체된다.
export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-20">
      <h1 className="text-3xl font-semibold">SSAFY 프로젝트, 한곳에서.</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        만든 걸 올리고, 남이 만든 걸 써보고, 익명으로 솔직한 피드백을 남기세요.
      </p>
      <Link
        href="/projects"
        className="mt-8 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
      >
        둘러보기
      </Link>
    </div>
  );
}
