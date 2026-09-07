"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { drawRaffle } from "@/features/raffle/actions";

export function DrawButton({ raffleId }: { raffleId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">정말 추첨할까요? 되돌릴 수 없습니다.</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await drawRaffle(raffleId);
                if (result.error) {
                  setError(result.error);
                  setConfirming(false);
                } else {
                  router.refresh();
                }
              })
            }
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "추첨 중…" : "네, 추첨합니다"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-xl border border-border px-4 py-2 text-sm"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white"
        >
          추첨하고 시드 공개하기
        </button>
      )}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
