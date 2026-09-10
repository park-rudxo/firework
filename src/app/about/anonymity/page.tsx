import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { MIN_RESPONSES_TO_REVEAL } from "@/features/survey/anonymity";

export const metadata: Metadata = {
  title: "익명성 정책",
  description: "설문 응답이 제작자에게 작성자 정보 없이 전달되는 방식과, 그 약속의 한계",
};

export default function AnonymityPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <ShieldCheck className="size-8 text-success" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">설문 응답은 작성자 정보 없이 전달됩니다</h1>
      <p className="mt-3 text-muted-foreground">
        firework 가 지키는 약속은{" "}
        <strong className="text-foreground">
          &ldquo;제작자에게 작성자 정보를 제공하지 않는다&rdquo;
        </strong>{" "}
        입니다. &ldquo;누구도 절대 알아낼 수 없다&rdquo;가 아닙니다. 뒤쪽은 참이 아니고, 참이 아닌
        것을 약속하면 그 약속을 믿고 솔직하게 쓴 사람이 다칩니다. 그래서 무엇을 어떻게 막았는지와
        무엇을 못 막는지를 함께 적어둡니다.
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
          제작자 화면에는 둘을 잇는 조회가 아예 없고, 만들 근거도 데이터에 없습니다.
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
              개별 답변은 {MIN_RESPONSES_TO_REVEAL}건 단위 묶음으로만 공개합니다.
            </strong>{" "}
            응답이 한둘뿐이면 내용 자체가 곧 작성자를 가리킵니다. 그리고 임계 위로 전부 보여주면,
            제작자가 결과 화면을 열어둔 채 기다리다 {MIN_RESPONSES_TO_REVEAL}건에서 한 건 늘어나는
            순간 &ldquo;방금 들어온 그 하나&rdquo;를 지목할 수 있습니다. 그래서 {MIN_RESPONSES_TO_REVEAL}
            , {MIN_RESPONSES_TO_REVEAL * 2}, {MIN_RESPONSES_TO_REVEAL * 3} … 처럼 묶음으로만 늘립니다.
          </li>
          <li>
            <strong className="text-foreground">응답 도착 알림을 보내지 않습니다.</strong> 새 응답이
            들어올 때마다 제작자에게 알리면 응답 시각이 그대로 새어 나갑니다. 시간을 지워둔 의미가
            알림 하나로 되살아납니다.
          </li>
          <li>
            <strong className="text-foreground">추첨 응모도 응답과 연결되지 않습니다.</strong>{" "}
            응모권은 참여 기록 쪽에만 붙습니다. 당첨자를 뽑아도 그 사람이 뭐라고 썼는지는 알 수
            없습니다.
          </li>
        </ul>
      </section>

      <section className="mt-10 rounded-card border border-accent/40 bg-accent/5 p-5">
        <h2 className="font-medium">이건 저희가 막을 수 없습니다</h2>
        <ul className="mt-2 flex flex-col gap-3 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">참여자가 적으면 표본 자체가 익명성을 깹니다.</strong>{" "}
            응답이 한 명뿐이라면 두 기록을 나란히 놓기만 해도 대응이 보입니다. 구조로 막을 수 있는
            것이 아니라 사람 수의 문제입니다. 위의 묶음 공개는 이걸 눌러두는 조치일 뿐, 없애지는
            못합니다.
          </li>
          <li>
            <strong className="text-foreground">
              데이터베이스에 직접 접근할 수 있는 운영자는 추론할 수 있습니다.
            </strong>{" "}
            화면에서 막은 것과 물리적으로 불가능한 것은 다릅니다. 저희가 막은 것은 제작자에게
            제공하는 경로이고, 서버 운영자까지 막았다고 말하지는 않겠습니다.
          </li>
          <li>
            <strong className="text-foreground">본인이 스스로 밝히면 그대로 드러납니다.</strong>{" "}
            자유서술에 이름, 기수, &ldquo;저번에 카톡으로 말씀드린&rdquo; 같은 언급을 적으시면
            구조로 가릴 수 없습니다. 솔직하게 쓰시되 신원은 적지 말아주세요.
          </li>
        </ul>
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
        를 직접 확인하실 수 있습니다. 스키마에 작성자 컬럼이 없다는 것과 개별 응답이 묶음으로만
        공개된다는 것을 테스트로 못박아 뒀습니다.{" "}
        <Link href="/about/reporting" className="underline">
          신고 정책도 보기
        </Link>
      </p>
    </div>
  );
}
