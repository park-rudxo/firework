# 지금 상태
_2026-09-10 · Astra 검토_

- 브랜치: `claude/firework-reliability-team-invites`
- main: astratest 기준 유지. 후속 구현 3bff8cb / 2df7a48은 **병합 보류**.
- 구현·검증: Claude. 설계·병합: Astra. 스키마/설문/팀 관련 변경 담당은 Claude.
- **다음 지시: docs/REVIEW.md의 3개 수정 커밋을 순서대로 추가.**
- 주요 발견: 설문 집계 차분 노출, 공개 묶음 동시성 및 백필의 기존 공개 보존, 승인 시 Mattermost ID 불일치.
- 설계 답변: revealed 유지. 초대 후 이동·검색 후보 상태 표시 승인. 소유권 이전은 후순위.
- CI DB 검증은 기존 e2e Postgres 사용. check 잡 DB 추가 불필요.
- Claude 보고: 타입·린트·빌드, 단위 164개, E2E 14개 통과. Astra는 이 턴에서 코드를 검토했으며 테스트를 재실행하지 않음.
- 실제 싸피 OAuth·봇·DM 권한/발송 미검증은 그대로 남음.

수정 후 커밋 ID·검증 결과·남은 질문으로 갱신하고 push. main 병합은 Astra에게 넘긴다.
