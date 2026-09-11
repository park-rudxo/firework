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

## 2026-09-11 · Astra 운영 DB 복구 완료
- 사용자 요청으로 예외적으로 Astra가 실행. 운영 host는 ep-winter-paper-b3bsckcs, neondb/public.
- 원인: 과거 Claude의 20260910044458_subscription_notification_bugreport_update가 먼저 성공해 ProjectUpdateKind(PROGRESS/RELEASE/FIX/NOTICE)가 존재했음.
- 백업 recovery-before-community-20260910 (br-crimson-paper-b3iprxcd), 2026-09-17 17:58 KST 자동 삭제. 전날 복제 DB에서 전체 복구 시험 후 롤백 완료.
- 운영에서 기존 타입을 LegacyProjectUpdateKind로 보존하고 원본 community_mattermost SQL 전체 적용. 트랜잭션 내 원본 기준 DB와 컬럼/기본값/PK/FK/index 127개 항목 및 enum 일치 검증 후 커밋.
- 계정 3개 보존. 프로젝트/구독/팀/설문 및 과거 커뮤니티 테이블은 각 0개 유지. 테이블/데이터 삭제 없음.
- 공식 Prisma migrate resolve --applied 20260910040000_community_mattermost 성공 (2026-09-11 05:00 UTC). 이후 이력/스키마 재검증 완료. 미해결 실패 기록 없음.
- TCP 연결 시간 초과로 Neon 공식 serverless Client 및 localhost 전용 TCP→인증서 검증 WSS 임시 프록시 사용. Prisma CLI 종료 시 프록시 종료. 비밀값 문서/커밋에 없음.
- 후속 2개 마이그레이션은 미적용. 재배포/main 병합 미실행. REVIEW.md 3개 수정 및 Preview/Production DB 분리 확인 후 진행.
- 과거 성공 migration은 현 브랜치에 없는 이력으로 보존됨. 다음 스키마 정리에서 다루며 migrate reset 금지.
