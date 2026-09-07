"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ProjectStatus } from "@prisma/client";

import { publishProject, unpublishProject } from "@/features/project/actions";

export function PublishToggle({ slug, status }: { slug: string; status: ProjectStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 관리자 조치 중인 프로젝트는 제작자가 되돌릴 수 없다.
  const locked = status === "HIDDEN" || status === "REMOVED";
  const published = status === "PUBLISHED";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex-1">
        <p className="text-sm font-medium">
          {published ? "공개 중" : locked ? "관리자 조치 중" : "비공개 (나만 보임)"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {published
            ? "둘러보기 목록과 홈에 노출됩니다."
            : locked
              ? "관리자 검토가 끝나야 다시 공개할 수 있습니다."
              : "공개해야 다른 사람이 보고, 설문과 추첨에 참여할 수 있습니다."}
        </p>
        {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : null}
      </div>

      <button
        type="button"
        disabled={pending || locked}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = published ? await unpublishProject(slug) : await publishProject(slug);
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
        className={`rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
          published
            ? "border border-border hover:bg-surface-muted"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {pending ? "처리 중…" : published ? "비공개로 되돌리기" : "공개하기"}
      </button>
    </div>
  );
}
