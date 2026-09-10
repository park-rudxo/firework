# 구독·버그 관리와 Mattermost 연결

## 사용자 동작

- 프로젝트 상세 → 소식·버그 제보 → 구독·알림 설정.
- 구독만 하면 내 구독과 캘린더에 표시된다. 외부 알림은 기본 OFF.
- 업데이트·진행 소식과 참여 모집을 별도로 동의한다.
- 구독을 해제하면 설정과 대기 알림을 취소한다. 재구독해도 알림은 OFF.
- 제작자는 대시보드 → 소식·버그에서 소식을 게시하고 접수/확인 중/수정 완료를 관리한다.
- 버그 상세와 작성자는 신고자와 OWNER/MAINTAINER만 조회한다. 공개 설문과 별개다.
- 제작자도 프로젝트별 관리 알림을 직접 켜야 Mattermost 메시지를 받는다.
- 신고자는 구독 없이도 자기 신고의 상태 알림만 별도로 선택할 수 있다.
- Mattermost 연결 해제는 모든 외부 알림 동의와 대기 발송을 취소한다.
- 사이트 내 버그 접수·상태 알림은 외부 메시지 수신 동의와 별개다.

## 인증

싸피 서버의 OAuth 앱 허용 여부는 아직 확인되지 않았다. 설정이 없으면 연결 버튼과 외부 알림 활성화를 제공하지 않는다.

1. meeting.ssafy.com에 confidential OAuth 앱을 등록한다.
2. 콜백 URL: `https://배포도메인/api/mattermost/callback`.
3. 서버 환경변수 MATTERMOST_CLIENT_ID, MATTERMOST_CLIENT_SECRET 설정.
4. BETTER_AUTH_URL은 실제 서비스의 원점 주소로 설정.

기존 firework 로그인 후 Mattermost 계정을 연결하는 방식이다. 인증 코드는 서버에서 교환하고 /api/v4/users/me 결과의 활성 사용자 ID를 저장한다. 임의 닉네임이나 클라이언트 전달 ID를 인증 근거로 쓰지 않는다. 사용자 OAuth 토큰은 DB에 저장하지 않는다.

state는 무작위 값, HttpOnly 쿠키, 현재 firework 사용자, DB 만료시간에 연결되며 한 번만 소비된다. Mattermost ID에는 UNIQUE 제약이 있어 여러 firework 계정에 중복 연결할 수 없다.

인증은 싸피 Mattermost 계정 소유 확인을 의미한다. 현재 학적·졸업 여부를 따로 조회하지 않는다. 계정 연결 자체는 알림 수신 동의가 아니다.

## 메시지 발송

이 웹앱은 출석 확장의 브라우저 쿠키/개인 웹훅을 수집하지 않는다. 인증과 독립된 전용 봇이 개인 DM으로 전달한다. 봇 사용 가능 여부와 수신 대상에게 DM을 생성할 권한을 운영자가 먼저 확인해야 한다.

필요한 서버 환경변수:

- MATTERMOST_BOT_TOKEN: 전용 봇 토큰
- MATTERMOST_BOT_USER_ID: 해당 봇의 사용자 ID
- CRON_SECRET: 충분히 긴 임의 문자열

모두 서버 비밀값이다. NEXT_PUBLIC 접두사를 붙이지 않는다. 설정만 넣으면 알림 동의 화면이 활성화되므로, 운영에서는 OAuth와 봇 및 스케줄러를 검증한 후 함께 활성화한다.

외부 스케줄러가 1분 간격으로 다음 요청을 실행하도록 설정한다.

```text
POST https://배포도메인/api/internal/mattermost-delivery
Authorization: Bearer <CRON_SECRET>
```

자동 배포나 실제 메시지 전송은 개발 검증 과정에서 수행하지 않았다.

## 발송 신뢰성

소식/버그 생성과 발송 대기 항목을 같은 DB 트랜잭션으로 저장한다. 발송 시점에 계정 연결, 현재 권한, 현재 동의, 동의 변경 시각, 프로젝트 공개 상태를 다시 검사한다. 취소 후 다시 켜도 예전 항목은 발송하지 않는다.

워커는 최대 10건을 처리하고 60초 임대로 중복 실행을 제한한다. 실패 시 지수 간격으로 최대 5회 시도하며 이후 FAILED로 남긴다. MattermostDelivery의 FAILED, 오래된 PENDING/SENDING을 운영 모니터링 대상으로 삼는다.

고정 pending_post_id를 사용하지만 외부 발송 성공 직후 DB 기록 전에 프로세스가 종료되는 상황에서 정확히 한 번 전달을 보장하지 않는다. 수신 거부 직전에 이미 외부 서버로 넘어간 요청도 회수할 수 없다.

외부 메시지는 고정 안내문과 firework 링크로 구성한다. 사용자 작성 본문, 익명 설문 답변, 버그 내용, 연락처는 포함하지 않는다. 익명 설문의 개별 응답 알림 경로는 추가하지 않았다.

## 적용과 검증

```text
npm ci
npm run db:deploy
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

새 마이그레이션은 기존 구독과 팀원에 알림 기본값 false를 추가한다. 기존 데이터를 삭제하지 않는다.

OAuth 실서버 확인 항목: 정상 연결, 사용자 거부, 만료/재사용 state, 다른 계정에 중복 연결, 연결 해제.
발송 실서버 확인 항목: 동의 없는 계정 0건, 선택 종류만 수신, 구독 해제 후 미발송, 봇 권한 오류, 재시도.

참고: https://developers.mattermost.com/integrate/apps/authentication/oauth2/
