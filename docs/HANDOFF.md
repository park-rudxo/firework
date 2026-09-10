# 지금 상태

> 이 파일은 기록이 아니라 **현재 상태**다. 이어받을 때 덮어쓴다.
> 한 화면을 넘기면 필요 없는 것이 섞인 것이다.

_마지막 갱신: 2026-09-10 · Claude_

## 담당

| 영역 | 담당 | 파일 |
| --- | --- | --- |
| Mattermost 연결·발송 | **Astra** | `src/features/mattermost/`, `src/app/api/mattermost/`, `src/app/api/internal/` |
| 구독·버그·소식 | **Astra** | `src/features/community/` |
| 큐레이션·설문·권한 | **Claude** | `src/features/curation/`, `src/features/survey/`, `src/features/project/permissions.ts` |
| 스키마 | **비어 있음** | `prisma/schema.prisma` — 만지기 전에 여기에 이름을 적는다 |

## 진행 중

- `astratest` — Astra. Mattermost 봇 DM 발송, 구독·버그·소식. typecheck·lint·테스트 116개 통과 확인함
- `claude/inspiring-einstein-ao0b9b` — Claude. 같은 기능을 따로 만든 것 + 신뢰성 수정. 테스트 157개, E2E 13개 통과

두 브랜치가 같은 기능을 각자 만들었다. 병합 방침은 `DECISIONS.md` 2026-09-10 항목에 있다.

## 막혀 있는 것

- **싸피 Mattermost 가 OAuth 앱 등록을 허용하는지 확인 안 됨.** 사람이 확인해야 한다.
  설정이 없으면 연결 버튼을 띄우지 않으므로 이대로 배포해도 문제는 없다
- **봇 계정 발급과 DM 권한도 미확인.** 위와 같은 사람 몫이다

## 다음

1. `astratest` 를 `main` 에 병합 (Mattermost·구독·버그·소식의 기준이 된다)
2. Claude 브랜치에서 인기 정렬·조회수 점수·익명성 문구·권한 정리만 골라 얹기
3. 그 위에서 홈 3섹션 재구성, 운영 상태(개발 중·종료), 실행 형태(웹·확장·영상)
