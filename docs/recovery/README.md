# P3009 복구 실행 순서

격리 DB(PostgreSQL 16)에서 실패 상태를 재현해 검증한 결과다.
**운영 DB 에 접근할 수 없어 실제 상태는 확인하지 못했다.** 1번을 돌려 결과를 알려주면
분기 판단까지 끝난다.

## 먼저 알아야 할 것 — 부분 적용이 기본값이다

`20260910040000_community_mattermost` 는 `ALTER TYPE ... ADD VALUE` 를 포함한다.
그런 문장이 있으면 **Prisma 는 마이그레이션 파일을 트랜잭션 없이 실행한다.**
그래서 중간에 실패하면 그 앞까지는 그대로 남는다.

격리 DB 재현 결과(마지막 FK 에서 실패시킴):

| 확인한 것 | 값 |
| --- | --- |
| `applied_steps_count` | **0** |
| 실제로 남은 것 | enum 4종 · 컬럼 5개 · 테이블 4개 · 인덱스 6개 · FK 6개 |

**`applied_steps_count` 로 판단하면 안 된다.** 0 인데 대부분 적용돼 있었다.
`01-diagnose.sql` 의 2번 표로 판단한다.

그리고 부분 적용 상태에서 원본 SQL 을 다시 돌리면 이렇게 실패한다:

```
ERROR:  type "BugStatus" already exists
ERROR:  enum label "BUG_REPORTED" already exists
```

→ **부분 적용이면 `resolve --rolled-back` 후 재시도는 실패한다.** 전진 복구를 쓴다.

## 0. 복구 전에 막아둘 것

- **자동 재배포를 멈춘다.** `vercel.json` 의 `buildCommand` 가
  `prisma migrate deploy && next build` 라서 **Preview 배포도 마이그레이션을 돌린다.**
  Preview 와 운영이 같은 DB 를 보고 있으면 복구 중에 다른 배포가 끼어든다.
- **복구 가능한 스냅샷을 확보한다.** Neon 이면 branch/PITR, 그 외면 `pg_dump`.
- **직결 주소로 실행한다.** 풀러(PgBouncer, 호스트에 `-pooler`)를 거치면
  `ALTER TYPE ... ADD VALUE` 와 어드바이저리 락이 어긋난다.
  `DIRECT_DATABASE_URL` 이 있으면 그것을, 없으면 풀러를 거치지 않는 `DATABASE_URL` 을 쓴다.

## 1. 진단 (읽기 전용)

```
psql "<DIRECT_DATABASE_URL>" -f docs/recovery/01-diagnose.sql
```

출력 전부를 그대로 회신한다. 비밀값은 들어 있지 않다 — 0번 항목은 DB 이름·스키마·역할·호스트·버전뿐이다.

## 2. 상태별 분기

`01-diagnose.sql` **2번 표**를 본다. 위에서부터 `t` 가 이어지다 `f` 로 바뀌는 지점이 실패한 문장이다.

| 2번 표 | 상태 | 할 일 |
| --- | --- | --- |
| 28개 전부 `f` | 아무것도 반영 안 됨 | `migrate resolve --rolled-back` 후 원인을 없애고 재배포 |
| 일부 `t` 일부 `f` | **부분 적용** | `02-forward-fix.sql` 로 채운 뒤 `resolve --applied` |
| 28개 전부 `t` | 이미 전부 반영됨 | 1번의 `logs` 를 증거로 남기고 `resolve --applied` |

### 부분 적용일 때 (가장 가능성 높음)

```
# 1) 빠진 것만 채운다. 기존 행은 읽지도 바꾸지도 않는다.
psql "<DIRECT_DATABASE_URL>" -f docs/recovery/02-forward-fix.sql

# 2) 스키마가 목표와 같아졌는지 다시 확인 — 2번 표가 28개 전부 t 여야 한다
psql "<DIRECT_DATABASE_URL>" -f docs/recovery/01-diagnose.sql

# 3) 그 증거를 확인한 뒤에만
npx prisma migrate resolve --applied 20260910040000_community_mattermost
```

### 아무것도 반영 안 됐을 때

```
npx prisma migrate resolve --rolled-back 20260910040000_community_mattermost
```

이 명령은 **SQL 을 되돌리지 않는다.** 실패 기록만 지워 재시도를 열어준다.
원인을 먼저 없애지 않으면 같은 자리에서 또 실패한다.

## 3. 복구 뒤 상태 확인

```
npx prisma migrate status
```

이렇게 나와야 한다 — 후속 2개는 **대기 상태로 남는다.**

```
Following migrations have not yet been applied:
20260910072918_survey_response_sticky_reveal
20260910073300_project_team_invitations
```

**여기서 `migrate deploy` 를 돌리지 않는다.** 그 두 개는 REVIEW.md 의 수정·검토를 마친 뒤
적용한다. 복구와 미검토 기능 배포를 섞지 않는다.

## 4. 검증한 것 (격리 DB)

| 확인 | 결과 |
| --- | --- |
| 부분 적용 DB 에 전진 복구 → 정상 적용 DB 와 스키마 비교 | 카탈로그 432개 항목 **완전 일치** |
| 아무것도 없는 DB 에 전진 복구 | 같은 결과. 어느 지점에서 멈췄든 같은 곳에 도착한다 |
| 3회 반복 실행 | 매번 같은 결과. 오류 없음 |
| 기존 데이터 보존 | users 3 · projects 1 · members 1 · follows 2 · responses 5 · participations 2 — 복구 전후 동일 |
| 기존 행의 알림 기본값 | `notifyUpdates` · `notifyRecruitment` · `notifyManagement` 전부 `false` |
| 전진 복구 후 `resolve --applied` | P3009 해소. 후속 2개는 대기 상태 유지 |

## 5. 재발 방지 (Astra 판단)

`buildCommand` 가 모든 배포에서 마이그레이션을 돌린다. Preview 가 운영 DB 를 공유하면
Preview 배포 하나가 운영 스키마를 바꾼다. 갈라놓는 방법은 몇 가지가 있고 어느 쪽이든
설계 결정이라 여기서 바꾸지 않았다.

- Preview 에 별도 DB 를 붙인다 (가장 안전, 손이 가장 많이 감)
- 마이그레이션을 빌드에서 떼어내 운영 배포 단계에서만 돌린다
- 최소한 `DIRECT_DATABASE_URL` 을 풀러를 거치지 않는 주소로 채운다
