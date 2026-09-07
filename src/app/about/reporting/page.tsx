import type { Metadata } from "next";
import Link from "next/link";
import { Flag } from "lucide-react";

import { REASON_LABEL, REASON_SEVERITY } from "@/features/report/policy";
import type { ReportReason } from "@prisma/client";

export const metadata: Metadata = {
  title: "신고 정책",
  description: "신고가 어떻게 처리되는지",
};

const ORDER: ReportReason[] = [
  "MALWARE",
  "DATA_HARVESTING",
  "IMPERSONATION",
  "COMMERCIAL_SALE",
  "COPYRIGHT",
  "INAPPROPRIATE",
  "RAFFLE_FRAUD",
  "SPAM",
  "OTHER",
  "BROKEN_LINK",
];

const SEVERITY_NOTE = {
  CRITICAL: "관리자에게 즉시 알림이 가고 큐 맨 위에 놓입니다.",
  HIGH: "관리자 큐 상단에 놓입니다.",
  NORMAL: "관리자 큐에 순서대로 쌓입니다.",
  INFO: "관리자를 거치지 않고 제작자에게만 전달됩니다.",
} as const;

export default function ReportingPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Flag className="size-8 text-danger" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">신고 정책</h1>

      <section className="mt-6 rounded-card border border-border bg-surface p-5">
        <h2 className="font-medium">신고만으로는 아무것도 내려가지 않습니다</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          신고가 몇 건 쌓이면 자동으로 숨기는 방식은 쓰지 않습니다. 그렇게 만들면 경쟁 프로젝트를
          신고 몇 번으로 죽일 수 있고, 오신고 한 번에 멀쩡한 프로젝트가 사라집니다. 신고는 관리자
          큐에 쌓이고, <strong className="text-foreground">사람이 확인한 뒤에만</strong> 숨김이나
          삭제가 이뤄집니다.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          같은 대상에 신고가 여러 건 쌓이면 관리자 화면에서 눈에 띄게 강조될 뿐, 그 자체로 상태가
          바뀌지는 않습니다. 조치가 이뤄지면 제작자에게 사유가 전달되고, 오판이었다면 되돌립니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">신고 사유와 처리</h2>
        <ul className="mt-4 flex flex-col gap-2">
          {ORDER.map((reason) => {
            const severity = REASON_SEVERITY[reason];
            return (
              <li
                key={reason}
                className="rounded-card border border-border bg-surface px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{REASON_LABEL[reason]}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      severity === "CRITICAL"
                        ? "bg-danger/15 text-danger"
                        : severity === "HIGH"
                          ? "bg-accent/15 text-accent"
                          : "bg-surface-muted text-muted-foreground"
                    }`}
                  >
                    {severity}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{SEVERITY_NOTE[severity]}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">신고 전에 알아두실 것</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
          <li>· 같은 대상을 여러 번 신고할 수는 없습니다. 한 번이면 충분합니다.</li>
          <li>
            · 추첨이 의심되면 신고 전에{" "}
            <Link href="/about/anonymity" className="underline">
              추첨 검증
            </Link>
            을 먼저 해보세요. 결과는 누구나 직접 재계산할 수 있습니다.
          </li>
          <li>· 악의적인 반복 신고는 기록으로 남고 제재 대상이 됩니다.</li>
        </ul>
      </section>
    </div>
  );
}
