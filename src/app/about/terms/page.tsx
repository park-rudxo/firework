import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";

import { contactEmail } from "@/lib/env";

export const metadata: Metadata = {
  title: "이용약관",
  description: "firework 서비스 이용약관",
};

export const EFFECTIVE_DATE = "2026년 9월 8일";

/**
 * 이용약관.
 *
 * 형식을 갖추기 위한 문서가 아니다. 카카오 비즈 앱 전환과 네이버 로그인 검수에서
 * 실제로 요구하는 항목이고, 무엇보다 이 서비스에는 "익명 설문"과 "경품 추첨"처럼
 * 분쟁이 생길 여지가 뚜렷한 기능이 있다. 그 두 가지를 어떻게 다루는지를
 * 여기에 적어두지 않으면 판단 기준이 운영자의 그때그때 기분이 된다.
 */
export default function TermsPage() {
  const contact = contactEmail();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <ScrollText className="size-8 text-primary" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">이용약관</h1>
      <p className="mt-2 text-sm text-muted-foreground">시행일: {EFFECTIVE_DATE}</p>

      <Section title="제1조 (목적)">
        <p>
          이 약관은 firework(이하 &ldquo;서비스&rdquo;)가 제공하는 프로젝트 공유·피드백 기능의
          이용 조건과 절차, 이용자와 서비스의 권리·의무를 정합니다.
        </p>
      </Section>

      <Section title="제2조 (서비스의 내용)">
        <p>서비스는 다음 기능을 제공합니다.</p>
        <ul>
          <li>프로젝트 등록과 둘러보기 — GitHub 저장소, 배포된 웹서비스, 앱 등 형태를 가리지 않습니다</li>
          <li>관심 등록·좋아요·&ldquo;써봤어요&rdquo; 표시</li>
          <li>제작자가 여는 익명 설문과 그 응답</li>
          <li>설문 응답자를 대상으로 한 경품 추첨</li>
          <li>프로젝트 일정 안내와 신고 접수</li>
        </ul>
      </Section>

      <Section title="제3조 (이용 자격)">
        <ul>
          <li>구글·카카오·네이버·GitHub 계정 중 하나로 로그인하면 둘러보기와 반응 표시를 할 수 있습니다.</li>
          <li>
            설문 응답, 추첨 응모, 프로젝트 등록에는 이메일 확인이 필요합니다. 계정을 여러 개
            만들어 설문과 추첨을 부풀리는 것을 막기 위한 최소한의 장치입니다.
          </li>
          <li>
            GitHub 저장소를 프로젝트에 연결하려면 GitHub 계정 연결이 필요합니다. 저장소가 정말
            본인 것인지 확인할 근거가 그것뿐이기 때문입니다. 저장소 없이 서비스 주소만 등록하는
            경우에는 필요하지 않습니다.
          </li>
        </ul>
      </Section>

      <Section title="제4조 (이용자의 책임)">
        <p>다음 행위는 금지됩니다. 확인되면 해당 게시물이 숨겨지거나 삭제될 수 있습니다.</p>
        <ul>
          <li>악성코드·피싱을 포함하거나, 필요 범위를 넘는 개인정보·자격증명을 요구하는 프로젝트 등록</li>
          <li>타인의 프로젝트·저작물을 자신의 것으로 등록하거나 라이선스를 위반하는 행위</li>
          <li>타인이나 단체를 사칭하는 행위</li>
          <li>서비스를 상업적 판매·광고 목적으로 이용하는 행위</li>
          <li>추첨을 조작하거나, 당첨자에게 약속한 경품을 지급하지 않는 행위</li>
          <li>같은 프로젝트를 반복 등록하거나 신고 기능을 남용하는 행위</li>
        </ul>
        <p>
          등록한 프로젝트의 내용과 그 프로젝트가 이용자에게 미치는 영향에 대한 책임은 등록자에게
          있습니다. 서비스는 등록된 프로젝트를 대신 검증하거나 보증하지 않습니다.
        </p>
      </Section>

      <Section title="제5조 (설문과 익명성)">
        <ul>
          <li>
            설문 응답은 제작자와 운영자를 포함한 누구에게도 작성자를 알 수 없는 형태로
            저장됩니다. 저장 구조 자체가 그렇게 되어 있으며, 자세한 내용은{" "}
            <Link href="/about/anonymity" className="text-primary underline">
              익명성 정책
            </Link>
            에서 확인할 수 있습니다.
          </li>
          <li>
            같은 이유로 <strong className="text-foreground">응답은 제출 후 수정·삭제할 수 없습니다.</strong>{" "}
            어떤 응답이 누구 것인지 특정할 수 없기 때문에, 특정 응답만 찾아 지우는 것도 불가능합니다.
          </li>
          <li>
            자유서술에 본인을 알아볼 수 있는 내용을 직접 적으면 익명성이 깨질 수 있습니다. 이
            경우는 서비스가 구조로 막을 수 없습니다.
          </li>
          <li>응답이 일정 수에 이르기 전에는 제작자에게도 개별 응답 대신 집계만 보여줍니다.</li>
        </ul>
      </Section>

      <Section title="제6조 (경품 추첨)">
        <ul>
          <li>
            추첨은 개설 시점에 공개된 커밋값과 추첨 후 공개되는 시드로 누구나 당첨자를 다시 계산해
            검증할 수 있습니다. 서비스나 제작자가 결과를 임의로 바꿀 수 없습니다.
          </li>
          <li>
            <strong className="text-foreground">경품은 프로젝트 제작자가 직접 제공합니다.</strong>{" "}
            서비스는 추첨 과정과 당첨 사실 전달만 담당하며, 경품의 지급·품질·세금 문제에 대해
            책임지지 않습니다. 지급이 이뤄지지 않은 경우 신고해 주시면 해당 제작자에 대한 조치를
            검토합니다.
          </li>
          <li>
            당첨자가 경품 수령을 위해 제출한 연락처는 해당 제작자에게만 전달되며, 경품 지급 외의
            목적으로 쓰일 수 없습니다.
          </li>
        </ul>
      </Section>

      <Section title="제7조 (신고와 게시물 조치)">
        <ul>
          <li>
            신고가 접수되었다는 사실만으로 프로젝트가 자동으로 내려가지 않습니다. 신고 몇 건으로
            멀쩡한 프로젝트를 죽일 수 있게 되기 때문입니다. 숨김·삭제는 언제나 관리자가 직접
            판단합니다.
          </li>
          <li>조치가 이뤄지면 해당 프로젝트의 제작자에게 사유와 함께 알립니다.</li>
          <li>
            신고 기준과 처리 방식은{" "}
            <Link href="/about/reporting" className="text-primary underline">
              신고 정책
            </Link>
            에 정리되어 있습니다.
          </li>
        </ul>
      </Section>

      <Section title="제8조 (계정과 게시물의 삭제)">
        <p>
          이용자는 언제든 계정 삭제를 요청할 수 있습니다. 계정이 삭제되면 등록한 프로젝트, 반응,
          참여 기록, 추첨 응모 내역이 함께 삭제됩니다. 다만 이미 제출된 설문 응답은 작성자와
          연결되어 있지 않아 <strong className="text-foreground">특정해서 삭제할 수 없습니다.</strong>{" "}
          이는 익명성을 위해 감수한 결과입니다.
        </p>
      </Section>

      <Section title="제9조 (서비스의 변경과 중단)">
        <p>
          서비스는 운영상·기술상 필요에 따라 기능의 전부 또는 일부를 변경하거나 중단할 수
          있습니다. 중요한 변경은 사전에 서비스 화면을 통해 알립니다.
        </p>
      </Section>

      <Section title="제10조 (책임의 한계)">
        <p>
          서비스는 무상으로 제공되며, 등록된 프로젝트의 동작·안전성·정확성을 보증하지 않습니다.
          외부 링크로 연결되는 사이트와 앱은 각 제작자의 책임 아래 운영됩니다. 다만 서비스의 고의
          또는 중대한 과실로 발생한 손해에 대한 책임은 제한하지 않습니다.
        </p>
      </Section>

      <Section title="제11조 (약관의 변경)">
        <p>
          약관이 변경되면 시행일과 변경 내용을 서비스 화면에 공지합니다. 이용자에게 불리한
          변경은 시행일로부터 7일 전에 알립니다.
        </p>
      </Section>

      <Section title="제12조 (문의)">
        <p>
          {contact ? (
            <>
              서비스 이용에 관한 문의는 <a className="text-primary underline" href={`mailto:${contact}`}>{contact}</a>{" "}
              로 보내주세요.
            </>
          ) : (
            <>
              서비스 이용에 관한 문의는{" "}
              <a
                href="https://github.com/park-rudxo/firework/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                저장소 이슈
              </a>
              로 남겨주세요.
            </>
          )}
        </p>
      </Section>

      <p className="mt-10 text-sm text-muted-foreground">
        <Link href="/about/privacy" className="underline">
          개인정보처리방침도 보기
        </Link>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground [&_li]:ml-4 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
        {children}
      </div>
    </section>
  );
}
