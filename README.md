# firework

**SSAFY 프로젝트 공유 플랫폼 — 프로젝트판 플레이스토어.**

SSAFY에서는 관통·특화·자율 프로젝트에 토이 프로젝트까지 끊임없이 만들어지는데, 공유는 노션·카톡·에타에 흩어지고 만든 사람이 "실제로 써본 사람"의 솔직한 피드백을 받을 창구는 없다. firework는 그 흐름을 한 줄로 잇는다.

```
둘러본다 → 써본다 → 익명으로 피드백을 남긴다 → 경품 추첨에 응모한다 → 일정을 따라간다
```

---

## 이 서비스의 핵심 결정 세 가지

### 1. 설문은 정말로 익명이다 — 스키마 수준에서

익명 설문과 "응답자 대상 추첨"은 정면으로 충돌한다. 익명인데 당첨자를 어떻게 뽑나?

**테이블을 둘로 쪼개고 서로 참조하지 않는 것**으로 푼다.

| 테이블 | 담는 것 | 담지 않는 것 |
| --- | --- | --- |
| `survey_response` | 응답 내용, 응답 **날짜** | **userId (존재하지 않음)**, 응답 시각 |
| `survey_participation` | 누가 응답했는지, 정확한 시각 | 응답 내용 |

두 레코드는 한 트랜잭션에서 생기지만 서로를 가리키는 컬럼이 없다. 그래서:

- 제작자는 응답 내용만 본다
- **운영자가 DB에 직접 접근해도 응답↔사용자를 엮을 수 없다** — 설계상 불가능
- `survey_response.id`는 순번이 아니라 UUID라 제출 순서를 추론할 수 없다
- 제출 시각을 초 단위로 남기면 `participation.createdAt`과 타이밍으로 조인할 수 있어서, **날짜만** 저장한다
- 응답이 3건 미만이면 개별 응답을 감추고 집계만 보여준다 (소수 응답 재식별 차단)

### 2. 추첨은 사후 검증할 수 있다 — commit–reveal

제작자가 직접 추첨을 돌리니 "지인한테 몰아준 거 아니냐"는 의심이 필연이다.

1. **개설 시** 서버가 `seed`를 만들고 `sha256(seed)`만 공개한다 (커밋)
2. **추첨 시** `HMAC-SHA256(seed, ticketCode)` 값을 정렬해 상위 N명을 뽑는다
3. **추첨 후** `seed`를 공개한다 (리빌)

누구나 `sha256(seed) == seedHash`를 확인하고 당첨자를 처음부터 재계산할 수 있다. 추첨 공개 페이지에 응모 티켓 목록과 검증 방법이 그대로 노출된다.

### 3. 신고에 자동 숨김은 없다

신고 N건으로 프로젝트가 자동으로 내려간다면 경쟁 프로젝트를 신고 몇 번으로 죽일 수 있고, 오신고 한 번에 멀쩡한 프로젝트가 사라진다.

신고는 **관리자 큐에 쌓이고, 사유별 심각도는 알림 세기와 정렬 순서만 결정한다.** 숨김·삭제는 언제나 관리자의 수동 판단이다.

| 심각도 | 사유 | 처리 |
| --- | --- | --- |
| `CRITICAL` | 악성코드 · 개인정보 수집 · 사칭 | 관리자 즉시 알림 + 큐 최상단 |
| `HIGH` | 외부 상업 판매 · 저작권 · 부적절 · 추첨 조작 | 큐 상단 |
| `NORMAL` | 스팸 · 기타 | 일반 큐 |
| `INFO` | 링크 깨짐 | 관리자를 거치지 않고 제작자에게만 |

---

## 인증: 소셜은 열고, 업로더만 조인다

|  | 일반 사용자 | 프로젝트 업로더 |
| --- | --- | --- |
| 할 수 있는 것 | 둘러보기 · 관심등록 · 설문응답 · 추첨응모 · 일정 · 신고 | + 프로젝트 등록/수정 · 일정 · 설문 · 추첨 개설 |
| 필요 인증 | Google / Kakao / Naver / GitHub **아무거나 하나** | **GitHub 계정 연결 필수** |

외부인을 막지 않는다. 다만 프로젝트를 올리려면 GitHub 연결이 필요하고, 그 계정으로 저장소 소유권까지 확인한다.

---

## 기술 스택

| 항목 | 버전 | 비고 |
| --- | --- | --- |
| Node.js | 24 LTS | Next 16 요구사항은 `>=20.9.0` |
| Next.js | 16.3.4 | App Router · Turbopack · `middleware.ts` 대신 `proxy.ts` |
| React | 19.2.8 | |
| TypeScript | **6.0.3 (고정)** | ⚠️ 아래 참고 |
| Tailwind CSS | 4.3.3 | |
| Prisma | **7.10.0 (고정)** | ⚠️ 아래 참고 |
| PostgreSQL | 18 | 로컬 Docker / 운영 Neon |
| Better Auth | 1.7.3 | Google·Kakao·Naver·GitHub 내장 |
| Zod | 4.5.4 | Server Action 입력 검증 |
| ESLint | **9.39.5** | ⚠️ 아래 참고 |

### 버전을 고정한 이유 (그냥 최신으로 올리면 깨진다)

- **TypeScript는 6.0.3에서 멈춘다.** 7.0은 Go 네이티브 재작성이라 `lib/typescript.js`가 빠졌고, Next.js가 TypeScript를 인식하지 못한다. `typescript-eslint@8.69.0`의 peer 범위도 `>=4.8.4 <6.1.0`이라 7은 아예 밖이다. 프로그래매틱 API는 7.1 예정.
- **ESLint는 9.39.5에서 멈춘다.** `eslint-config-next`가 끌어오는 `eslint-plugin-react@7.37.5`의 peer가 `^9.7`에서 끊긴다. ESLint 10에서는 제거된 `context.getFilename`을 써서 실행 즉시 터진다.
- **Prisma는 7.10.0을 정확히 지정한다.** `prisma@latest`는 `8.0.0-rc`를 끌어온다.
- Prisma 7부터 연결 문자열이 `schema.prisma`가 아니라 `prisma.config.ts`에 있고, 런타임은 드라이버 어댑터(`@prisma/adapter-pg`)로 연결한다. `.env` 자동 로딩도 사라져서 설정 파일에서 직접 읽는다.

---

## 시작하기

```bash
cp .env.example .env          # 값을 채운다 (최소 DATABASE_URL, BETTER_AUTH_SECRET, 소셜 하나)
npm install
docker compose up -d          # PostgreSQL 18
npm run db:migrate            # 스키마 적용
npm run dev
```

`BETTER_AUTH_SECRET`은 `openssl rand -base64 32`로 만든다.

소셜 로그인 콜백 URL은 모두 `{BETTER_AUTH_URL}/api/auth/callback/{provider}` 형태다.

`GITHUB_TOKEN`(public repo 읽기 전용 PAT)이 없으면 저장소 메타 수집이 시간당 60회로 제한된다. 있으면 5,000회.

### 명령어

```bash
npm run dev         # 개발 서버
npm run build       # 프로덕션 빌드
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run e2e         # Playwright
npm run db:migrate  # 마이그레이션 생성·적용
npm run db:studio   # Prisma Studio
```

---

## 구조

```
src/
├─ app/                  라우트. API 라우트는 Better Auth 캐치올 하나뿐이고
│                        나머지 쓰기는 전부 Server Actions + Zod 검증
├─ components/           UI
├─ features/             도메인 로직 (project · curation · calendar · survey · raffle · report)
└─ lib/                  auth · db · github · sanitize · session · env
prisma/schema.prisma     데이터 모델
```

`src/lib/sanitize.ts`가 특히 중요하다. 이 서비스가 화면에 얹는 HTML은 상당수가 **남의 GitHub 저장소 README**다. 신뢰 불가 입력으로 취급해 사용자 마크다운과 같은 파이프라인을 통과시키고, `next.config.ts`의 CSP로 한 겹 더 막는다.
