# 배포

**Vercel + Neon** 기준이다. 둘 다 무료 티어로 끝까지 갈 수 있고, 저장소가 이미
그 조합을 전제로 맞춰져 있다(`vercel.json`, `prisma.config.ts`).

전체 30분쯤 걸린다. **순서가 중요하다** — 아래 두 가지 때문이다.

- **환경변수를 먼저 넣어야 빌드가 된다.** `npm ci` 의 `postinstall` 이 `prisma generate`
  를 부르고, Prisma 7 은 설정 파일에서 `DATABASE_URL` 을 읽는다. 없으면 설치 단계에서
  `Cannot resolve environment variable: DATABASE_URL` 로 죽는다. 빌드 실패가 아니라
  **설치 실패**라서 로그를 봐도 원인이 잘 안 보인다.
- **OAuth 콜백은 도메인이 정해진 뒤에야 등록할 수 있다.** 그래서 Vercel 프로젝트를
  먼저 만들어 도메인을 확정하고(배포는 아직 안 해도 된다), 그 주소로 OAuth 앱을
  등록한 다음, 환경변수를 채우고 배포한다.

---

## 1. 데이터베이스 — Neon

1. https://console.neon.tech → **New Project**
2. 리전은 **Asia Pacific (Seoul)** 또는 가까운 곳
3. **Connection string** 에서 두 개를 복사한다. 같은 화면에서 토글로 바뀐다.

| | 복사할 것 | 쓰는 곳 |
| --- | --- | --- |
| `DATABASE_URL` | **Pooled connection** (호스트에 `-pooler` 가 붙음) | 앱 런타임 |
| `DIRECT_DATABASE_URL` | **Direct connection** (`-pooler` 없음) | 마이그레이션 |

둘 다 뒤에 `?sslmode=require` 가 붙어 있어야 한다.

> 왜 두 개인가 — 서버리스 함수는 요청마다 커넥션을 새로 여니 풀러를 거쳐야 한다.
> 반대로 마이그레이션은 풀러(PgBouncer) 뒤에서 돌리면 DDL 과 어드바이저리 락이
> 어긋난다. `prisma.config.ts` 가 `DIRECT_DATABASE_URL` 이 있으면 그쪽을 쓴다.

---

## 2. Vercel 프로젝트 만들기 (아직 배포하지 않는다)

1. https://vercel.com/new → 이 저장소를 **Import**
2. Framework 는 자동으로 Next.js 로 잡힌다. 빌드 설정은 `vercel.json` 이 들고 있으므로
   화면에서 손댈 것이 없다.
3. **Deploy 를 누르기 전에** 3~5번을 먼저 한다. 지금 누르면 환경변수가 없어 설치 단계에서
   실패한다 — 실패해도 프로젝트와 도메인은 남으니 치명적이지는 않다.
4. 배정된 도메인을 확인한다. `https://<프로젝트이름>.vercel.app` 이다.
   **이 주소가 아래 모든 곳에 들어간다.** 커스텀 도메인을 붙일 거라면 지금 붙이고
   그 주소를 쓴다 — 나중에 바꾸면 OAuth 앱을 전부 다시 등록해야 한다.

---

## 3. 소셜 로그인 앱 등록

콜백 URL 은 전부 같은 형태다.

```
https://<도메인>/api/auth/callback/<프로바이더>
```

**GitHub 은 사실상 필수다.** 프로젝트 등록에 GitHub 계정 연결이 필요해서, 없으면
아무도 프로젝트를 올릴 수 없다.

1. https://github.com/settings/developers → **New OAuth App**
   - Homepage URL: `https://<도메인>`
   - Authorization callback URL: `https://<도메인>/api/auth/callback/github`
   - Client secret 은 발급 화면을 벗어나면 다시 못 본다. 바로 복사한다.
2. (선택) Google — https://console.cloud.google.com/apis/credentials
   - OAuth 2.0 클라이언트 ID → 승인된 리디렉션 URI 에 `.../api/auth/callback/google`
3. (선택) Kakao, Naver 도 같은 형태다.

로컬 개발을 계속 할 거면 **로컬용 앱을 따로 만든다.** 한 앱에 콜백을 두 개 넣는 것보다
앱을 나누는 쪽이 낫다 — 운영 secret 이 로컬 `.env` 에 섞이지 않는다.

---

## 4. 나머지 값 준비

```bash
openssl rand -base64 32      # BETTER_AUTH_SECRET — 로컬 것을 재사용하지 않는다
```

- **`ADMIN_EMAILS`** — 본인 이메일. 비워두면 배포 직후 관리자가 아무도 없어서
  신고 큐를 열 사람이 없다. 승격은 **이메일이 검증된 계정**에만 걸리므로
  Google 또는 GitHub 으로 로그인해야 한다.
- **`RESEND_API_KEY`** (권장) — https://resend.com/api-keys (무료 3,000통/월).
  없으면 이메일 인증 코드가 사용자 화면 대신 **서버 로그**로 간다. 네이버 로그인은
  그 코드를 받아야 넘어갈 수 있어서 사실상 막힌다. 도메인을 붙이기 전에는
  `EMAIL_FROM` 을 비워두면 Resend 테스트 발신 주소를 쓴다.
- **`GITHUB_TOKEN`** (권장) — public repo 읽기 전용 PAT. 없으면 저장소 메타 수집이
  시간당 60회로 제한된다. 있으면 5,000회.

### 올리기 전에 한 번 확인한다

값을 파일에 모아두고 점검 스크립트를 돌린다. 콜백 URL 이 로컬로 남아 있거나,
프로바이더 자격증명이 한쪽만 채워져 있거나 하는 것들을 여기서 잡는다.

```bash
cp .env.example .env.production   # .gitignore 에 걸려 있어 커밋되지 않는다
# 값을 채운 뒤
npm run deploy:check .env.production
```

---

## 5. Vercel 환경변수 넣기

Project → **Settings → Environment Variables**. 전부 **Production** 에 넣는다.

| 이름 | 값 |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** 연결 문자열 |
| `DIRECT_DATABASE_URL` | Neon **direct** 연결 문자열 |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` 결과 |
| `BETTER_AUTH_URL` | `https://<도메인>` — 경로 없이 오리진만 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 3번에서 발급받은 값 |
| `ADMIN_EMAILS` | 본인 이메일 |
| `RESEND_API_KEY` / `EMAIL_FROM` | 선택 |
| `GITHUB_TOKEN` | 선택 |
| 그 밖의 프로바이더 | 등록한 것만 |

---

## 6. 배포

Deployments → **Redeploy** (또는 브랜치에 푸시).

빌드 커맨드가 `prisma migrate deploy && next build` 라서 **마이그레이션이 배포마다
자동으로 적용된다.** 따로 칠 명령은 없다.

> Preview 배포도 같은 커맨드를 돈다. Preview 환경에 `DATABASE_URL` 을 따로 주지 않으면
> Production DB 에 마이그레이션이 들어간다. 신경 쓰인다면 Preview 용 Neon 브랜치를
> 만들어 Preview 스코프에 별도 값을 넣는다.

**시드(`npm run db:seed`)는 운영에 넣지 않는다.** 데모 프로젝트가 실제 데이터처럼 섞인다.

---

## 7. 배포 후 확인

```bash
curl -i https://<도메인>/api/health     # {"status":"ok"} — 앱과 DB 둘 다 살아있다
```

`503 {"status":"error","check":"database"}` 면 앱은 떴는데 DB 에 못 붙은 것이다.
`DATABASE_URL` 과 Neon 프로젝트 상태를 본다.

그 다음 순서대로 밟아본다.

1. 홈이 열린다 — 아직 프로젝트가 없으니 비어 있는 게 정상이다
2. 오른쪽 위에서 **GitHub 로 로그인** → 프로필이 뜬다
3. `ADMIN_EMAILS` 에 넣은 계정이라면 알림에 "관리자로 지정되었습니다" 가 와 있다.
   `/admin/reports` 가 열리면 부트스트랩이 끝난 것이다
4. 프로젝트를 하나 등록해 저장소 메타(스타·언어·README)가 붙는지 본다

---

## 자주 막히는 곳

**설치 단계에서 `Cannot resolve environment variable: DATABASE_URL`**
환경변수를 넣기 전에 배포했다. 5번을 하고 Redeploy.

**로그인을 누르면 `redirect_uri_mismatch`**
프로바이더에 등록한 콜백 URL 과 `BETTER_AUTH_URL` 이 다르다. 슬래시 하나, `www` 유무까지
정확히 같아야 한다. `npm run deploy:check` 가 등록해야 할 주소를 그대로 찍어준다.

**로그인 후 localhost 로 돌아간다**
`BETTER_AUTH_URL` 이 아직 `http://localhost:3000` 이다.

**로그인 버튼은 뜨는데 누르면 실패한다**
`*_CLIENT_ID` / `*_CLIENT_SECRET` 중 한쪽만 채워졌거나 공백이 들어갔다.

**`/admin/reports` 가 안 열린다**
`ADMIN_EMAILS` 의 주소와 로그인한 계정의 이메일이 다르거나, 이메일이 검증되지 않은
프로바이더(카카오·네이버)로 들어왔다. 승격은 로그인할 때마다 확인하므로
값을 고치고 다시 로그인하면 붙는다.

**테이블이 없다는 오류**
`prisma migrate deploy` 가 풀러 주소로 돌았을 가능성이 크다. `DIRECT_DATABASE_URL` 을
확인한다.

---

## Vercel 이 아닌 곳에 올린다면

Next.js 는 Node 서버·Docker 어디든 올라간다(`npm run build && npm run start`).
`vercel.json` 만 안 쓰이고 나머지는 그대로다. 대신 **배포마다
`npx prisma migrate deploy` 를 직접 돌려야 한다** — Vercel 에서는 빌드 커맨드가
그걸 대신하고 있었을 뿐이다.
