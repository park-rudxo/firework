import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { MIN_RESPONSES_TO_REVEAL } from "@/features/survey/anonymity";

export const metadata: Metadata = {
  title: "익명성 정책",
  description: "설문 응답이 제작자에게도 익명으로 전달되는 방식",
};

export default function AnonymityPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <ShieldCheck className="size-8 text-success" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">설문 응답은 정말로 익명입니다</h1>
      <p className="mt-3 text-muted-foreground">
        &ldquo;익명으로 처리합니다&rdquo;라는 약속은 마음먹기에 달린 게 아니라 저장 구조에
        달렸습니다. 마음만 먹으면 열어볼 수 있는 구조라면 그건 익명이 아닙니다. 그래서 firework 는
        <strong className="text-foreground"> 열어볼 방법 자체가 없도록</strong> 만들었습니다.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">테이블을 둘로 쪼갰습니다</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          익명 설문과 &ldquo;응답자 대상 추첨&rdquo;은 정면으로 충돌합니다. 익명인데 당첨자를 어떻게
          뽑을까요? 저희는 &ldquo;무엇을 썼나&rdquo;와 &ldquo;누가 썼나&rdquo;를 서로 참조하지 않는
          두 테이블로 나눠서 풀었습니다.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-card border border-border bg-surface p-4">
            <h3 className="text-sm font-medium">응답 내용</h3>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
              <li>· 답변</li>
              <li className="text-danger">· 작성자 정보 없음</li>
              <li className="text-danger">· 언제 썼는지도 없음</li>
            </ul>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <h3 className="text-sm font-medium">참여 기록</h3>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
              <li>· 누가 응답했는지</li>
              <li>· 응답한 시각</li>
              <li className="text-danger">· 답변 내용 없음</li>
            </ul>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          두 기록은 같은 순간에 만들어지지만{" "}
          <strong className="text-foreground">서로를 가리키는 연결고리가 없습니다.</strong>{" "}
          데이터베이스를 통째로 들여다봐도 &ldquo;이 사람이 이 답을 썼다&rdquo;를 복원할 수
          없습니다. 제작자는 물론 운영자도 마찬가지입니다.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">우회로도 막았습니다</h2>
        <ul className="mt-3 flex flex-col gap-3 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">언제 썼는지를 남기지 않습니다.</strong> 처음에는
            &ldquo;시각은 위험하니 날짜만&rdquo;으로 뒀는데, 그걸로는 부족했습니다. 하루에 응답이
            한 건뿐인 날이면 그 날짜만으로 참여 기록과 1:1로 붙어버립니다. 사용자가 적은
            서비스에서는 그런 날이 오히려 흔합니다. 그래서 날짜조차 두지 않습니다.
          </li>
          <li>
            <strong className="text-foreground">응답에 순번을 매기지 않습니다.</strong> 1번, 2번
            식으로 번호가 붙으면 제출 순서를 알 수 있고, 그것만으로도 사람을 좁힐 수 있습니다.
          </li>
          <li>
            <strong className="text-foreground">
              응답이 {MIN_RESPONSES_TO_REVEAL}건 미만이면 개별 답변을 감춥니다.
            </strong>{" "}
            응답이 한둘뿐이면 내용 자체가 곧 작성자를 가리킵니다. 그때는 제작자에게도 집계만
            보여줍니다.
          </li>
          <li>
            <strong className="text-foreground">추첨 응모도 응답과 연결되지 않습니다.</strong>{" "}
            응모권은 참여 기록 쪽에만 붙습니다. 당첨자를 뽑아도 그 사람이 뭐라고 썼는지는 알 수
            없습니다.
          </li>
        </ul>
      </section>

      <section className="mt-10 rounded-card border border-accent/40 bg-accent/5 p-5">
        <h2 className="font-medium">다만, 이건 저희가 막을 수 없습니다</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          자유서술에 본인을 알아볼 수 있는 내용을 직접 적으시면 익명성이 깨집니다. 이름, 기수,
          &ldquo;저번에 카톡으로 말씀드린&rdquo; 같은 언급은 구조로 가릴 수 없습니다. 솔직하게
          쓰시되 신원은 적지 말아주세요.
        </p>
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        구현이 궁금하시면{" "}
        <a
          href="https://github.com/park-rudxo/firework"
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-primary underline"
        >
          소스 코드
        </a>
        를 직접 확인하실 수 있습니다. 스키마에 작성자 컬럼이 없다는 것을 테스트로도 못박아 뒀습니다.{" "}
        <Link href="/about/reporting" className="underline">
          신고 정책도 보기
        </Link>
      </p>
    </div>
  );
}
