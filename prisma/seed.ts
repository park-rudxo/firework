import { createHash, randomBytes } from "node:crypto";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config();

/**
 * 개발용 시드 데이터.
 *
 * 홈의 큐레이션 섹션은 반응이 있어야 채워지고, 익명 설문의 "3건 미만이면 감춤"
 * 규칙도 응답이 있어야 확인할 수 있다. 그래서 프로젝트만이 아니라 반응·설문
 * 응답·추첨 응모까지 만든다.
 *
 * 실행: npm run db:seed
 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const NAMES = ["김싸피", "이관통", "박특화", "최자율", "정프로", "한개발", "오테스트", "윤배포"];

/**
 * 닉네임은 기수_지역_반_이름 형식이다(src/features/profile/nickname.ts).
 * 시드도 같은 형식을 지켜야 한다 — 안 그러면 시드 계정으로 로그인했을 때
 * 곧바로 닉네임 게이트에 걸려 데모가 끊긴다.
 */
const CAMPUSES = ["서울", "대전", "광주", "구미", "부울경"];
const generationOf = (i: number) => 12 + (i % 3);
const nicknameOf = (name: string, i: number) =>
  `${generationOf(i)}_${CAMPUSES[i % CAMPUSES.length]}_${(i % 8) + 1}반_${name}`;

const PROJECTS = [
  {
    slug: "moamoa",
    name: "모아모아",
    tagline: "흩어진 스터디 자료를 한곳에 모아주는 팀 위키",
    category: "WEB" as const,
    tags: ["React", "협업툴", "관통프로젝트"],
    repoUrl: "https://github.com/facebook/react",
    language: "TypeScript",
    stars: 1240,
  },
  {
    slug: "chulseok",
    name: "출석왕",
    tagline: "SSAFY 출결을 자동으로 기록해주는 크롬 확장",
    category: "TOOL" as const,
    tags: ["Chrome Extension", "자동화"],
    repoUrl: "https://github.com/microsoft/vscode",
    language: "JavaScript",
    stars: 87,
  },
  {
    slug: "code-review-bot",
    name: "코드리뷰 봇",
    tagline: "PR을 열면 컨벤션 위반을 먼저 잡아주는 깃허브 앱",
    category: "AI" as const,
    tags: ["GitHub App", "LLM", "자율프로젝트"],
    repoUrl: "https://github.com/vercel/next.js",
    language: "Python",
    stars: 312,
  },
  {
    slug: "bapmuk",
    name: "밥먹자",
    tagline: "점심 메뉴 정하기 싸움을 끝내는 투표 앱",
    category: "MOBILE" as const,
    tags: ["React Native", "토이프로젝트"],
    repoUrl: "https://github.com/prisma/prisma",
    language: "Dart",
    stars: 45,
  },
  {
    slug: "algo-tracker",
    name: "알고 트래커",
    tagline: "백준·프로그래머스 풀이를 자동으로 커밋해주는 CLI",
    category: "TOOL" as const,
    tags: ["CLI", "알고리즘"],
    repoUrl: "https://github.com/tailwindlabs/tailwindcss",
    language: "Go",
    stars: 523,
  },
  {
    slug: "ssafy-market",
    name: "싸피마켓",
    tagline: "기수 안에서만 쓰는 중고 거래 장터",
    category: "WEB" as const,
    tags: ["Next.js", "특화프로젝트"],
    repoUrl: "https://github.com/better-auth/better-auth",
    language: "TypeScript",
    stars: 156,
  },
];

async function main() {
  console.log("시드 데이터를 넣습니다…");

  // 기존 데이터를 지운다. 참조 순서 때문에 자식부터.
  await db.raffleWinner.deleteMany();
  await db.raffleEntry.deleteMany();
  await db.raffle.deleteMany();
  await db.surveyResponse.deleteMany();
  await db.surveyParticipation.deleteMany();
  await db.survey.deleteMany();
  await db.projectEvent.deleteMany();
  await db.report.deleteMany();
  await db.notification.deleteMany();
  await db.project.deleteMany();
  await db.user.deleteMany();

  const users = await Promise.all(
    NAMES.map((name, i) =>
      db.user.create({
        data: {
          id: `seed-user-${i}`,
          name,
          email: `seed${i}@example.com`,
          emailVerified: true,
          profile: {
            create: {
              displayName: nicknameOf(name, i),
              githubLogin: `seed-dev-${i}`,
              ssafyGeneration: generationOf(i),
              // 첫 번째 사용자는 관리자로 둔다. 신고 큐를 확인할 수 있게.
              role: i === 0 ? "ADMIN" : "MEMBER",
            },
          },
        },
      }),
    ),
  );

  const now = Date.now();
  const daysFromNow = (d: number) => new Date(now + d * 24 * 60 * 60 * 1000);

  for (const [i, spec] of PROJECTS.entries()) {
    const owner = users[i % users.length]!;
    const publishedAt = daysFromNow(-(30 - i * 4));
    // 데모는 필수, 저장소는 선택이다. 저장소 없는 프로젝트도 한 건 만들어 상세 화면이
    // 그 경우에 어떻게 보이는지 바로 확인할 수 있게 한다.
    const repoUrl = i === PROJECTS.length - 1 ? null : spec.repoUrl;

    const project = await db.project.create({
      data: {
        slug: spec.slug,
        name: spec.name,
        tagline: spec.tagline,
        description: `## ${spec.name}\n\n${spec.tagline}\n\n### 이렇게 써보세요\n\n1. 저장소를 클론합니다\n2. \`npm install\` 후 \`npm run dev\`\n3. 브라우저에서 열어봅니다\n\n피드백은 언제든 환영입니다.`,
        category: spec.category,
        tags: spec.tags,
        demoUrl: `https://${spec.slug}.example.com`,
        repoUrl,
        ownerId: owner.id,
        // 저장소가 없으면 확인할 대상 자체가 없다.
        ownershipVerified: repoUrl !== null && i % 3 !== 0,
        status: "PUBLISHED",
        publishedAt,
        members: { create: { userId: owner.id, role: "OWNER" } },
        // 스냅샷은 GitHub 에서 받아온 정보라 저장소가 있을 때만 존재한다.
        ...(repoUrl
          ? {
              snapshot: {
                create: {
                  owner: repoUrl.split("/")[3]!,
                  repo: repoUrl.split("/")[4]!,
                  description: spec.tagline,
                  stars: spec.stars,
                  forks: Math.floor(spec.stars / 7),
                  openIssues: i * 3,
                  primaryLanguage: spec.language,
                  languages: { [spec.language]: 80000, CSS: 12000, HTML: 4000 },
                  license: "MIT",
                  topics: spec.tags.map((t) => t.toLowerCase()),
                  pushedAt: daysFromNow(-i * 2),
                },
              },
            }
          : {}),
      },
    });

    // 반응. 뒤쪽 프로젝트일수록 적게 붙어 순위가 갈린다.
    const reactors = users.filter((u) => u.id !== owner.id).slice(0, users.length - i);
    for (const [j, user] of reactors.entries()) {
      const createdAt = daysFromNow(-(j % 10));
      await db.projectLike.create({ data: { projectId: project.id, userId: user.id, createdAt } });
      if (j % 2 === 0) {
        await db.projectFollow.create({
          data: { projectId: project.id, userId: user.id, createdAt },
        });
      }
      if (j % 3 === 0) {
        await db.projectTry.create({
          data: { projectId: project.id, userId: user.id, createdAt },
        });
      }
    }

    await db.projectStatDaily.create({
      data: {
        projectId: project.id,
        day: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())),
        views: 40 + i * 17,
        outboundClicks: 5 + i * 3,
        surveyResponses: i === 0 ? 5 : i === 1 ? 2 : 0,
      },
    });

    // 일정
    await db.projectEvent.createMany({
      data: [
        {
          projectId: project.id,
          type: "RELEASE",
          title: `${spec.name} v1.0 출시`,
          startsAt: publishedAt,
          allDay: true,
          createdById: owner.id,
        },
        {
          projectId: project.id,
          type: i % 2 === 0 ? "TEST" : "UPDATE",
          title: i % 2 === 0 ? "베타 테스터 모집" : "v1.1 업데이트 예정",
          description: i % 2 === 0 ? "먼저 써보고 의견 주실 분을 찾습니다." : null,
          startsAt: daysFromNow(-2 + i),
          endsAt: daysFromNow(10 + i),
          allDay: true,
          createdById: owner.id,
        },
      ],
    });

    // 앞의 세 프로젝트에만 설문을 연다.
    if (i >= 3) continue;

    const survey = await db.survey.create({
      data: {
        projectId: project.id,
        title: "써보고 느낀 점을 알려주세요",
        description: "제작자에게 익명으로 전달됩니다.",
        questions: [
          { id: "overall", type: "rating", label: "전반적으로 얼마나 만족하셨나요?", required: true, max: 5 },
          { id: "usability", type: "rating", label: "쓰기 편했나요?", required: true, max: 5 },
          {
            id: "recommend",
            type: "choice",
            label: "다른 사람에게 추천하시겠어요?",
            required: true,
            options: ["추천한다", "보통이다", "추천하지 않는다"],
            multiple: false,
          },
          { id: "good", type: "text", label: "좋았던 점은 무엇인가요?", required: false, maxLength: 1000 },
          { id: "improve", type: "text", label: "고쳤으면 하는 점은?", required: false, maxLength: 1000 },
        ],
        closesAt: daysFromNow(14),
      },
    });

    await db.projectEvent.create({
      data: {
        projectId: project.id,
        type: "SURVEY",
        title: "설문: 써보고 느낀 점을 알려주세요",
        startsAt: daysFromNow(-3),
        endsAt: daysFromNow(14),
        allDay: true,
        url: `/projects/${spec.slug}/survey`,
        createdById: owner.id,
        autoSourceType: "survey",
        autoSourceId: survey.id,
      },
    });

    // 실제 개설 흐름과 같게 시드를 만들고 그 해시를 함께 저장한다.
    // 해시가 시드와 어긋나면 추첨 페이지가 "검증 실패"로 뜬다.
    const seed = randomBytes(32).toString("hex");
    const seedHash = createHash("sha256").update(seed, "utf8").digest("hex");

    const raffle = await db.raffle.create({
      data: {
        projectId: project.id,
        surveyId: survey.id,
        prizeName: ["스타벅스 기프티콘", "치킨 기프티콘", "문화상품권 1만원"][i]!,
        prizeDescription: "설문 응답자 중 추첨합니다.",
        winnerCount: 2,
        closesAt: daysFromNow(14),
        seedHash,
        seed,
        status: "OPEN",
      },
    });

    // 응답. 첫 프로젝트만 3건 이상 넣어 "개별 응답 공개" 임계를 넘긴다.
    // 두 번째는 2건이라 잠긴 화면을 확인할 수 있다.
    const responderCount = i === 0 ? 5 : i === 1 ? 2 : 0;
    const responders = users.filter((u) => u.id !== owner.id).slice(0, responderCount);

    const goodComments = [
      "설치가 간단해서 바로 써볼 수 있었어요.",
      "UI가 깔끔합니다. 특히 다크모드가 좋네요.",
      "문서가 잘 정리돼 있어서 헤매지 않았습니다.",
      "생각보다 빨라서 놀랐어요.",
      "필요했던 기능이 딱 있어서 좋았습니다.",
    ];
    const improveComments = [
      "모바일에서 레이아웃이 조금 깨집니다.",
      "에러 메시지가 불친절해요.",
      "설정을 저장하는 기능이 있으면 좋겠습니다.",
      "첫 로딩이 조금 느립니다.",
      "단축키가 있으면 더 편할 것 같아요.",
    ];

    for (const [j, user] of responders.entries()) {
      // 실제 제출과 같은 구조로 넣는다. 두 레코드는 서로를 가리키지 않는다.
      await db.surveyParticipation.create({
        data: { surveyId: survey.id, userId: user.id, createdAt: daysFromNow(-(j % 5)) },
      });
      await db.surveyResponse.create({
        data: {
          surveyId: survey.id,
          answers: {
            overall: 3 + (j % 3),
            usability: 4 - (j % 2),
            recommend: j % 4 === 3 ? "보통이다" : "추천한다",
            good: goodComments[j % goodComments.length],
            improve: improveComments[j % improveComments.length],
          },
        },
      });
      await db.raffleEntry.create({
        data: {
          raffleId: raffle.id,
          userId: user.id,
          ticketCode: randomBytes(8).toString("hex"),
        },
      });
    }
  }

  console.log(`프로젝트 ${PROJECTS.length}개, 사용자 ${users.length}명을 넣었습니다.`);
  console.log(`관리자 계정: ${users[0]!.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
