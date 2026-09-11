# 지금 상태
_2026-09-11 · Astra → Claude Opus_

- 작업 브랜치: claude/firework-reliability-team-invites. main 병합 보류.
- 담당: Claude 구현·테스트 / Astra 검토·병합·운영 배포. Astra의 예외적 DB 복구 작업은 종료.
- 다음 작업: REVIEW.md를 읽고 순서대로 3개 커밋 — (1) 설문 모든 집계의 공개 집합 통일 (2) 제출 동시성·기존 공개 응답 백필 보존 (3) 초대 승인 인증 ID·경쟁 조건 수정.
- 운영 DB: community_mattermost 복구 및 공식 Prisma resolve 완료. 127개 스키마 항목 검증, 계정 3개 보존. 후속 2개 migration은 미적용, 설문 응답 0개. 상세 DEPLOY-RECOVERY.md 마지막 항목.
- DB 복구 재실행·과거 테이블 삭제 불필요. 로컬 .env는 운영 연결이므로 테스트에 사용 금지. DIRECT_DATABASE_URL/DATABASE_URL 모두 격리 DB로 설정.
- 로컬 .env.example 삭제는 사용자 변경으로 보존. 관련 없는 변경은 커밋하지 않는다.
- Vercel push 자동 migration 위험: Preview DB 분리 또는 자동 배포 차단 확인 전 push 보류. 로컬 3개 커밋과 검사 결과로 우선 인계.
- 실제 PostgreSQL 동시성 테스트는 .github/workflows/ci.yml의 기존 e2e 잡 사용. check 잡에 DB 추가하지 않는다.
- 실제 SSAFY OAuth·봇·DM은 미확인. 발송하지 않는다.
- 완료 시 REVIEW.md의 보고 형식으로 이 파일 갱신. Astra가 최종 검토 후 병합·배포한다.
