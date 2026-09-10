# 지금 상태
_2026-09-10 · Astra 검토_

- 브랜치: `claude/firework-reliability-team-invites`
- main: astratest 기준 유지. 후속 구현 3bff8cb / 2df7a48은 **병합 보류**.
- 구현·검증: Claude. 설계·병합: Astra. 스키마/설문/팀 관련 변경 담당은 Claude.
- **최우선: docs/DEPLOY-RECOVERY.md의 P3009 읽기 전용 진단과 상태별 복구. 이후 REVIEW.md의 3개 수정 커밋으로 복귀.**
- 배포 로그: 2df7a48의 migrate deploy가 이전 community_mattermost 실패 기록으로 중단. 원래 SQL 오류/부분 적용/Preview와 운영 DB 공유 여부는 아직 확인되지 않음.
- 주요 발견: 설문 집계 차분 노출, 공개 묶음 동시성 및 백필의 기존 공개 보존, 승인 시 Mattermost ID 불일치.
- 설계 답변: revealed 유지. 초대 후 이동·검색 후보 상태 표시 승인. 소유권 이전은 후순위.
- CI DB 검증은 기존 e2e Postgres 사용. check 잡 DB 추가 불필요.
- Claude 보고: 타입·린트·빌드, 단위 164개, E2E 14개 통과. Astra는 이 턴에서 코드를 검토했으며 테스트를 재실행하지 않음.
- 실제 싸피 OAuth·봇·DM 권한/발송 미검증은 그대로 남음.

수정 후 커밋 ID·검증 결과·남은 질문으로 갱신하고 push. main 병합은 Astra에게 넘긴다.
