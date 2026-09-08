import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";

import { contactEmail } from "@/lib/env";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "firework 가 수집하는 정보와 그 쓰임",
};

const EFFECTIVE_DATE = "2026년 9월 8일";

/**
 * 개인정보처리방침.
 *
 * 여기 적힌 항목은 스키마(prisma/schema.prisma)에 실제로 있는 컬럼과 하나씩 맞춘 것이다.
 * 모델을 고치면 이 문서도 같이 고쳐야 한다. 적어두고 지키지 않는 방침은 없느니만 못하다.
 *
 * 호스팅 사업자는 배포 환경이 정해지면 실제 상호로 바꿀 것.
 */
export default function PrivacyPage() {
  const contact = contactEmail();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Lock className="size-8 text-primary" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-muted-foreground">시행일: {EFFECTIVE_DATE}</p>

      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        firework(이하 &ldquo;서비스&rdquo;)는 서비스 운영에 꼭 필요한 정보만 수집합니다. 아래
        목록은 실제 데이터베이스에 저장되는 항목을 그대로 옮긴 것이며, 여기에 없는 정보는
        수집하지 않습니다.
      </p>

      <Section title="1. 수집하는 정보">
        <h3>가. 소셜 로그인으로 받는 정보</h3>
        <ul>
          <li>이름(또는 닉네임), 이메일 주소, 프로필 이미지 주소</li>
          <li>로그인에 사용한 서비스의 계정 식별자와 접근 토큰 — 계정 연결 유지에만 씁니다</li>
          <li>GitHub 계정을 연결한 경우 GitHub 로그인명 — 저장소 소유 확인에 씁니다</li>
        </ul>

        <h3>나. 이용자가 직접 입력하는 정보</h3>
        <ul>
          <li>표시 이름, 자기소개</li>
          <li>SSAFY 기수·트랙 (선택 입력, 적지 않아도 모든 기능을 쓸 수 있습니다)</li>
          <li>등록한 프로젝트의 이름·소개·링크·이미지 주소</li>
          <li>설문 응답 내용 (누가 썼는지와 연결되지 않는 형태로 저장됩니다)</li>
          <li>추첨에 당첨된 경우 경품 수령을 위해 제출하는 연락처</li>
          <li>신고 사유와 상세 내용</li>
        </ul>

        <h3>다. 서비스 이용 과정에서 자동으로 쌓이는 정보</h3>
        <ul>
          <li>로그인 세션 정보 — 접속 IP 주소, 브라우저 종류(User-Agent), 만료 시각</li>
          <li>좋아요·관심 등록·&ldquo;써봤어요&rdquo; 표시와 그 시각</li>
          <li>설문에 참여했다는 사실과 그 시각 (응답 내용과는 연결되지 않습니다)</li>
          <li>추첨 응모권</li>
          <li>프로젝트별 일별 조회 수와 외부 링크 클릭 수 — 개인을 구분하지 않는 합계입니다</li>
          <li>이메일 확인용 인증 코드 (사용되거나 만료되면 폐기)</li>
        </ul>

        <p>
          광고 식별자, 위치 정보, 연락처 목록, 결제 정보는 수집하지 않습니다. 분석·광고 목적의
          추적 도구도 사용하지 않습니다.
        </p>
      </Section>

      <Section title="2. 이용 목적">
        <ul>
          <li>회원 식별과 로그인 유지</li>
          <li>프로젝트 등록·공개와 저장소 소유 확인</li>
          <li>중복 응답·중복 응모 차단과 추첨 자격 판정</li>
          <li>당첨 사실 전달과 경품 지급</li>
          <li>신고 처리와 서비스 남용 대응</li>
          <li>인기 프로젝트 집계 등 서비스 개선</li>
        </ul>
      </Section>

      <Section title="3. 설문 응답을 따로 다루는 이유">
        <p>
          설문 응답은 <strong className="text-foreground">누가 썼는지를 저장하지 않습니다.</strong>{" "}
          응답 내용과 참여 사실을 서로 참조하지 않는 두 곳에 나눠 담아, 데이터베이스에 직접
          접근하더라도 둘을 이어붙일 수 없게 했습니다. 응답에는 작성 시각도 남기지 않습니다.
          자세한 구조는{" "}
          <Link href="/about/anonymity" className="text-primary underline">
            익명성 정책
          </Link>
          에 있습니다.
        </p>
        <p>
          그 결과 <strong className="text-foreground">특정 응답만 골라 열람하거나 삭제하는 것이 불가능합니다.</strong>{" "}
          이용자 본인의 요청으로도 마찬가지입니다. 이는 익명을 지키기 위해 감수한 제약입니다.
        </p>
      </Section>

      <Section title="4. 보유 기간과 파기">
        <ul>
          <li>계정 정보와 활동 기록: 회원 탈퇴 시까지. 탈퇴하면 지체 없이 삭제합니다.</li>
          <li>로그인 세션: 최대 30일. 만료되면 삭제됩니다.</li>
          <li>이메일 인증 코드: 사용 또는 만료 즉시 폐기.</li>
          <li>
            당첨자가 제출한 연락처: 경품 지급이 끝나면 제작자가 삭제해야 하며, 계정 탈퇴 시 함께
            삭제됩니다.
          </li>
          <li>
            설문 응답 내용: 작성자와 연결되어 있지 않아 탈퇴 시에도 남습니다. 다만 그 내용으로
            개인을 식별할 수 없습니다.
          </li>
        </ul>
      </Section>

      <Section title="5. 제3자 제공과 처리 위탁">
        <p>
          수집한 정보를 제3자에게 판매하거나 제공하지 않습니다. 다만 다음의 경우는 예외입니다.
        </p>
        <ul>
          <li>
            추첨에 당첨된 이용자가 경품 수령을 위해 직접 제출한 연락처는 해당 프로젝트 제작자에게
            전달됩니다.
          </li>
          <li>법령에 따라 수사기관이 적법한 절차로 요구하는 경우</li>
        </ul>
        <p>서비스 운영을 위해 다음 업무를 외부에 맡기고 있습니다.</p>
        <ul>
          <li>이메일 발송(인증 코드): Resend</li>
          <li>데이터베이스와 애플리케이션 호스팅: 클라우드 호스팅 사업자</li>
        </ul>
        <p>
          프로젝트에 연결된 GitHub 저장소의 공개 정보(스타 수, 사용 언어, README)를 GitHub 에서
          가져옵니다. 이 과정에서 이용자의 개인정보를 GitHub 에 보내지 않습니다.
        </p>
      </Section>

      <Section title="6. 이용자의 권리">
        <ul>
          <li>표시 이름·소개·기수 정보는 설정 화면에서 언제든 확인하고 고칠 수 있습니다.</li>
          <li>연결된 소셜 계정은 설정 화면에서 확인할 수 있습니다.</li>
          <li>
            계정 삭제와 보유 정보 열람은 아래 문의처로 요청할 수 있고, 요청을 받으면 지체 없이
            처리합니다.
          </li>
          <li>
            다만 3항에서 밝힌 대로 이미 제출된 설문 응답은 특정할 수 없어 개별 삭제가
            불가능합니다.
          </li>
        </ul>
      </Section>

      <Section title="7. 쿠키">
        <p>
          로그인 상태를 유지하기 위한 쿠키만 사용합니다. 광고나 행태 분석을 위한 쿠키는 쓰지
          않습니다. 브라우저 설정으로 쿠키를 차단할 수 있으나, 그 경우 로그인이 유지되지 않습니다.
        </p>
      </Section>

      <Section title="8. 만 14세 미만 아동">
        <p>
          서비스는 만 14세 이상을 대상으로 합니다. 만 14세 미만 아동의 개인정보를 의도적으로
          수집하지 않으며, 확인되면 해당 계정과 정보를 삭제합니다.
        </p>
      </Section>

      <Section title="9. 안전성 확보 조치">
        <ul>
          <li>비밀번호를 직접 다루지 않습니다. 인증은 전적으로 소셜 로그인에 맡깁니다.</li>
          <li>이메일 검증이 확실한 프로바이더에 한해서만 같은 이메일의 계정 연결을 자동 허용합니다.</li>
          <li>
            외부에서 가져온 README 등 HTML 은 화면에 표시하기 전에 반드시 정제하고, 콘텐츠 보안
            정책으로 한 겹 더 막습니다.
          </li>
          <li>개인정보에 접근할 수 있는 인원을 운영자로 한정합니다.</li>
        </ul>
      </Section>

      <Section title="10. 문의처">
        <p>
          {contact ? (
            <>
              개인정보 보호 책임자에게{" "}
              <a className="text-primary underline" href={`mailto:${contact}`}>
                {contact}
              </a>{" "}
              로 문의할 수 있습니다.
            </>
          ) : (
            <>
              개인정보 관련 문의는{" "}
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
        <p>
          개인정보 침해에 대한 신고·상담이 필요하면 개인정보침해신고센터(privacy.kisa.or.kr,
          국번 없이 118)에 문의할 수 있습니다.
        </p>
      </Section>

      <Section title="11. 방침의 변경">
        <p>
          내용이 바뀌면 변경 사항과 시행일을 이 화면에 공지합니다. 이용자에게 불리한 변경은
          시행일로부터 7일 전에 알립니다.
        </p>
      </Section>

      <p className="mt-10 text-sm text-muted-foreground">
        <Link href="/about/terms" className="underline">
          이용약관도 보기
        </Link>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground [&_h3]:mt-2 [&_h3]:font-medium [&_h3]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
        {children}
      </div>
    </section>
  );
}
