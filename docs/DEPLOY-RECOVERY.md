# P3009 배포 복구 — Claude 최우선 지시
대상: Vercel, 브랜치 claude/firework-reliability-team-invites, 실패 로그의 커밋 2df7a48.
원래 실패: 20260910040000_community_mattermost, 2026-09-10 05:23:47 UTC.
현재 P3009는 이전 실패 기록 때문에 중단된 결과이며 원래 SQL 오류가 아니다. Next build는 시작되지 않았다.

## 1. 읽기 전용 진단 (DB 변경 전에 완료)
- 실패한 배포의 Vercel 환경(Preview/Production)과 Prisma가 실제 사용하는 DIRECT_DATABASE_URL 또는 DATABASE_URL의 대상 DB/스키마 확인. 비밀값은 로그나 인계 문서에 쓰지 않는다.
- Preview가 운영 DB를 공유하는지 확인. 복구 중 같은 DB를 대상으로 한 병렬 마이그레이션/자동 재배포를 피한다.
- 아래 SQL로 원래 오류를 확보한다. 기존 배포 로그의 P3018/DB error도 확인한다.
```sql
SELECT migration_name, started_at, finished_at, rolled_back_at,
       applied_steps_count, logs
FROM public._prisma_migrations
ORDER BY started_at DESC
LIMIT 10;
```
- 해당 migration.sql의 enum 값, 2개 기존 테이블의 신규 컬럼, 4개 신규 테이블, 인덱스, FK를 실제 카탈로그와 대조한다. applied_steps_count만으로 부분 적용 여부를 판단하지 않는다.
- 다른 브랜치의 비슷한 마이그레이션/테이블 충돌, 권한, 원래 SQL 오류 중 근거로 확인된 원인만 보고한다.
- db reset, db push --accept-data-loss, 테이블 삭제, _prisma_migrations 직접 편집, 근거 없는 migrate resolve는 하지 않는다.

## 2. 상태에 맞는 최소 복구안
- 아무 SQL도 반영되지 않은 상태: 원인 제거 후 migrate resolve --rolled-back 20260910040000_community_mattermost 로 실패 시도만 재실행 가능하게 한다. 이 명령 자체는 SQL을 되돌리지 않는다.
- 일부 반영: 복구 가능한 DB 스냅샷/백업 확보 후 누락된 항목만 보완하는 전진 복구를 우선 검토. 데이터 보존과 enum/컬럼/기본값/유일성/인덱스/FK 모두 대조한다.
- 전체 목표 스키마가 이미 정확히 반영: 일치 증거를 남긴 뒤에만 migrate resolve --applied 20260910040000_community_mattermost.
- 연결 정보가 없으면 추정 복구하지 말고 위 SQL의 원래 오류와 스키마 조회 결과를 사용자에게 요청한다. 자격증명을 채팅으로 받지 않는다.

## 3. 검증과 완료 조건
- 가능하면 동일한 실패 스키마를 복제한 격리 DB에서 복구 SQL과 기존 데이터 보존을 먼저 검증한다.
- 성공/실패 migration 상태, 실제 스키마 일치, 기존 계정/프로젝트/구독 보존, 알림 기본 OFF를 확인한다.
- 현재 브랜치 후속 2개 마이그레이션(익명성/초대)은 REVIEW.md 수정·검토 전 무작정 migrate deploy로 적용하지 않는다. 복구와 미검토 기능 배포를 섞지 않는다.
- 저장소 변경이 필요하면 복구 관련 파일만 별도 커밋. 적용된 과거 SQL은 임의 수정하지 않는다.
- HANDOFF: 원인, 대상 환경, 적용 전/후 상태, 실행한 명령(비밀값 제외), 데이터 검증, 남은 작업을 기록.
- DB 상태 확인 결과는 REVIEW.md의 기존 응답 백필 판단에도 사용한다. 복구 후 원래 3개 수정 작업으로 복귀한다.
