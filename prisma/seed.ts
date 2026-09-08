import { createHash, randomBytes } from "node:crypto";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  SEED_EMAIL_DOMAIN,
  SEED_PROJECT_SLUGS,
  SEED_USER_ID_PREFIX,
} from "./seed-manifest";

config();

/**
 * 개발용 시드 데이터.
 *
 * 홈의 큐레이션 섹션은 반응이 있어야 채워지고, 익명 설문의 "3건 미만이면 감춤"
 * 규칙도 응답이 있어야 확인할 수 있다. 그래서 프로젝트만이 아니라 반응·설문
 * 응답·추첨 응모까지 만든다.
 *
 * 이 스크립트는 시작할 때 기존 데이터를 전부 지운다. 그래서 로컬 데이터베이스가
 * 아니면 실행을 거부한다 — 운영 DB 를 향한 채로 무심코 돌리는 사고가 한 번이면
 * 되돌릴 수 없기 때문이다. 정말 필요하면 SEED_FORCE=1 을 붙인다.
 *
 * 넣은 데모 데이터를 지우는 것은 npm run db:purge 다. 그쪽은 전체 삭제가 아니라
 * 시드가 만든 행만 골라 지우므로 실사용 중인 데이터베이스에서도 안전하다.
 *
 * 실행: npm run db:seed
 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** 로컬로 볼 수 있는 호스트. docker compose 도 localhost 로 노출된다. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);

function assertSafeTarget() {
  if (process.env.SEED_FORCE === "1") return;

  let host: string;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    host = "";
  }
  if (LOCAL_HOSTS.has(host)) return;

  console.error(
    `\n시드는 기존 데이터를 전부 지우고 시작합니다. 지금 DATABASE_URL 이 가리키는 곳은` +
      `\n로컬이 아닙니다(${host || "알 수 없음"}). 실수로 운영 데이터를 지우지 않도록 중단합니다.` +
      `\n\n정말 이 데이터베이스를 초기화하려면 SEED_FORCE=1 npm run db:seed\n`,
  );
  process.exit(1);
}

const NAMES = ["김싸피", "이관통", "박특화", "최자율", "정프로", "한개발", "오테스트", "윤배포"];

type SeedProject = {
  slug: string;
  name: string;
  tagline: string;
  category: "WEB" | "MOBILE" | "AI" | "GAME" | "TOOL" | "EMBEDDED" | "DATA" | "ETC";
  tags: string[];
  /** 저장소가 없는 프로젝트도 있다. 배포된 웹서비스나 스토어 앱은 서비스 주소만으로 등록된다. */
  repoUrl: string | null;
  demoUrl?: string;
  language: string | null;
  stars: number;
};

const PROJECTS: SeedProject[] = [
  {
    slug: "moamoa",
    name: "모아모아",
    tagline: "흩어진 스터디 자료를 한곳에 모아주는 팀 위키",
    category: "WEB",
    tags: ["React", "협업툴", "관통프로젝트"],
    repoUrl: "https://github.com/facebook/react",
    language: "TypeScript",
    stars: 1240,
  },
  {
    slug: "chulseok",
    name: "출석왕",
    tagline: "SSAFY 출결을 자동으로 기록해주는 크롬 확장",
    category: "TOOL",
    tags: ["Chrome Extension", "자동화"],
    repoUrl: "https://github.com/microsoft/vscode",
    language: "JavaScript",
    stars: 87,
  },
  {
    slug: "code-review-bot",
    name: "코드리뷰 봇",
    tagline: "PR을 열면 컨벤션 위반을 먼저 잡아주는 깃허브 앱",
    category: "AI",
    tags: ["GitHub App", "LLM", "자율프로젝트"],
    repoUrl: "https://github.com/vercel/next.js",
    language: "Python",
    stars: 312,
  },
  {
    slug: "bapmuk",
    name: "밥먹자",
    tagline: "점심 메뉴 정하기 싸움을 끝내는 투표 앱",
    category: "MOBILE",
    tags: ["React Native", "토이프로젝트"],
    repoUrl: "https://github.com/prisma/prisma",
    language: "Dart",
    stars: 45,
  },
  {
    slug: "algo-tracker",
    name: "알고 트래커",
    tagline: "백준·프로그래머스 풀이를 자동으로 커밋해주는 CLI",
    category: "TOOL",
    tags: ["CLI", "알고리즘"],
    repoUrl: "https://github.com/tailwindlabs/tailwindcss",
    language: "Go",
    stars: 523,
  },
  {
    slug: "ssafy-market",
    name: "싸피마켓",
    tagline: "기수 안에서만 쓰는 중고 거래 장터",
    category: "WEB",
    tags: ["Next.js", "특화프로젝트"],
    repoUrl: "https://github.com/better-auth/better-auth",
    language: "TypeScript",
    stars: 156,
  },
  // 저장소 없이 서비스 주소만으로 등록된 프로젝트. 소유 확인 배지도, GitHub 메타도 붙지 않는다.
  // 이 경로가 화면에서 깨지지 않는지 확인하려고 일부러 하나 넣어둔다.
  {
    slug: "jariitda",
    name: "자리있다",
    tagline: "빈 스터디룸을 실시간으로 알려주는 웹서비스",
    category: "WEB",
    tags: ["웹서비스", "토이프로젝트"],
    repoUrl: null,
    demoUrl: "https://jariitda.example.com",
    language: null,
    stars: 0,
  },
];

async function main() {
  assertSafeTarget();

  // 목록이 어긋나면 db:purge 가 지우지 못하는 데모 데이터가 생긴다. 여기서 바로 잡는다.
  const declared = new Set<string>(SEED_PROJECT_SLUGS);
  const missing = PROJECTS.filter((p) => !declared.has(p.slug)).map((p) => p.slug);
  if (missing.length > 0) {
    throw new Error(
      `seed-manifest.ts 의 SEED_PROJECT_SLUGS 에 없는 슬러그: ${missing.join(", ")}\n` +
        "purge 가 지우지 못하므로 매니페스트에 추가해주세요.",
    );
  }

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
          id: `${SEED_USER_ID_PREFIX}${i}`,
          name,
          email: `seed${i}${SEED_EMAIL_DOMAIN}`,
          emailVerified: true,
          profile: {
            create: {
              displayName: name,
              githubLogin: `seed-dev-${i}`,
              ssafyGeneration: 12 + (i % 3),
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

    const project = await db.project.create({
      data: {
        slug: spec.slug,
        name: spec.name,
        tagline: spec.tagline,
        description: `## ${spec.name}\n\n${spec.tagline}\n\n### 이렇게 써보세요\n\n1. 저장소를 클론합니다\n2. \`npm install\` 후 \`npm run dev\`\n3. 브라우저에서 열어봅니다\n\n피드백은 언제든 환영입니다.`,
        category: spec.category,
        tags: spec.tags,
        repoUrl: spec.repoUrl,
        demoUrl: spec.demoUrl ?? (i % 2 === 0 ? `https://${spec.slug}.example.com` : null),
        ownerId: owner.id,
        // 저장소가 없으면 확인할 소유권도 없다.
        ownershipVerified: spec.repoUrl ? i % 3 !== 0 : false,
        status: "PUBLISHED",
        publishedAt,
        members: { create: { userId: owner.id, role: "OWNER" } },
        snapshot:
          spec.repoUrl && spec.language
            ? {
                create: {
                  owner: spec.repoUrl.split("/")[3]!,
                  repo: spec.repoUrl.split("/")[4]!,
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
              }
            : undefined,
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
  console.log("실서비스를 열기 전에 npm run db:purge 로 이 데모 데이터를 지우세요.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
