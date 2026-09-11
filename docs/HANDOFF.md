# 지금 상태
_2026-09-11 · Astra → Claude Opus, 원격 작업 병합 반영_

- 브랜치: claude/firework-reliability-team-invites. main 병합·배포 최종 검토는 Astra.
- Opus의 3개 수정은 이미 도착했다: 679c3e0 설문 집계, a579540 제출 직렬화/백필, 8f02d59 초대 인증 ID. 같은 기능을 다시 구현하지 않는다.
- d97b288 복구 준비와 f1d4f8f 인계도 보존했다. Claude 보고: 타입/린트/빌드 통과, 단위 184개, E2E 23개. Astra는 아직 이 구현 전체를 검증하지 않았다.
- Astra 운영 복구 완료: 기존 타입 LegacyProjectUpdateKind 보존, community_mattermost 적용 및 공식 Prisma resolve 성공. 스키마 127개 항목 일치, 계정 3개 보존. DEPLOY-RECOVERY.md 마지막 항목이 실제 운영 결과다. docs/recovery의 복구 스크립트를 운영에 다시 실행하지 않는다.
- 2026-09-11 복구 검증 시 운영 후속 migration은 미적용, 설문 응답 0개였다. 이후 자동 배포 여부는 별도 확인 필요.

## Opus의 다음 작업 — 기존 구현의 보완
1. REVIEW.md 최신 통과 조건에 기존 3개 커밋을 대조한다. 이미 충족한 부분은 재작성하지 않는다. 미충족 항목만 후속 커밋으로 수정한다.
2. 우선 백필 20260910090000을 재검토한다. 현재 count>=3의 모든 응답을 true로 바꾸는 SQL은 sticky_reveal 적용 이후 들어온 새 응답까지 공개할 수 있다. 기존 3개 공개 + 신규 1개 미공개 상태에서 재현 테스트를 추가한다. 대상 환경의 적용 이력/기존 집합 근거 없이 모두 공개하지 않는다. 안전하게 구분 불가하면 배포 차단 사유와 선택지를 보고한다.
3. 동시성 테스트를 barrier/잠금 관찰로 겹치게 만들어 검출이 우연한 타이밍에 의존하지 않게 한다. 초대 해제/교체 경쟁과 기존 역할 보존은 REVIEW.md 조건으로 확인한다.
4. 변경 관련 테스트 후 최종 타입/린트/단위/빌드/E2E를 실행하고 명령·결과·미실행 항목·커밋 ID를 보고한다. PostgreSQL 통합 테스트가 기존 E2E에 포함되면 별도 명령/잡 추가는 불필요하다.

## 환경 경계
- 로컬 .env는 운영 연결. 테스트는 DIRECT_DATABASE_URL과 DATABASE_URL 모두 격리 DB로 지정. seed/reset/db push를 운영에서 실행하지 않는다.
- .env.example 삭제는 사용자 변경으로 보존. .env를 Git에 추가하지 않는다.
- 이번 인계 push는 사용자가 명시적으로 요청했다. 향후 구현 push 전 Preview DB 분리/자동 migration 경로를 확인한다. 운영 migration/main 병합은 맡지 않는다.
- 실제 SSAFY OAuth·봇·DM 권한은 미확인. 발송하지 않는다.
