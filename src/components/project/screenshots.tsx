"use client";

import { useState } from "react";

export function Screenshots({ urls, name }: { urls: string[]; name: string }) {
  const [active, setActive] = useState(0);
  const current = urls[active] ?? urls[0]!;

  return (
    <div>
      {/* 사용자가 넣은 임의 호스트의 이미지라 next/image 최적화 대상에서 뺀다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current}
        alt={`${name} 스크린샷 ${active + 1}`}
        className="w-full rounded-card border border-border bg-surface-muted object-contain"
      />

      {urls.length > 1 ? (
        <div className="rail mt-3 flex gap-2 overflow-x-auto">
          {urls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`스크린샷 ${i + 1} 보기`}
              aria-current={i === active}
              className={`shrink-0 overflow-hidden rounded-lg border ${
                i === active ? "border-primary" : "border-border opacity-60 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-16 w-24 object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
