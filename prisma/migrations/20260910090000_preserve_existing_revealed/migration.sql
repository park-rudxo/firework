-- 예전에 보이던 응답을 다시 감추지 않는다 — 단, 그래도 되는 근거가 있을 때만.
--
-- 앞선 마이그레이션(20260910072918)은 설문마다 3의 배수만큼만 열어뒀다.
-- 그게 문제다. 예전 구현에서는 3건 이상이면 전부 보였으므로, 5건짜리 설문에서
-- 제작자는 이미 5건을 다 읽었다. 거기서 3건만 남기면 2건이 "안 본 것" 이 되고,
-- 나중에 새 응답 1건이 그 2건과 함께 열리는 순간 —
-- 제작자는 이미 아는 2건을 빼고 남은 하나가 새 응답임을 바로 안다.
-- 감추려던 것이 오히려 신규 응답을 지목하게 만든다.
--
-- 그래서 예전에 공개 가능했던 설문(응답 3건 이상)은 전부 공개 상태로 되돌린다.
-- 이후로는 "아직 안 열린 응답" 기준으로 3건씩 열리므로, 5건짜리는 새 응답 3건이
-- 모여야 8건이 된다. 1·2건짜리 설문은 그때도 잠겨 있었으니 그대로 둔다.
--
-- ── 조건 없이 전부 여는 것은 왜 안 되나 ─────────────────────────────────
--
-- 위 논리는 "지금 안 열려 있는 행 = 예전부터 있던 행" 일 때만 성립한다.
-- 앞 마이그레이션이 적용된 뒤 묶음 규칙을 아는 앱이 응답을 받았다면 그 전제가 깨진다.
--
--     기존 3건(전부 공개) + 그 뒤 들어온 새 응답 1건(미공개)
--     → 조건 없이 열면 제작자 화면이 3건에서 4건이 되고, 늘어난 하나가 곧 새 응답이다.
--
-- 이 마이그레이션이 막으려던 바로 그 노출을 이 마이그레이션이 만들어내는 셈이다.
-- 그런데 응답 행에는 시간도 순번도 없다(익명성의 근거다). 그래서 "예전 행" 과
-- "새 행" 은 데이터만으로는 절대 구분할 수 없다. 구분할 수 있는 유일한 근거는
-- 앞 마이그레이션이 **언제 적용됐는가** 뿐이다.
--
-- 같은 migrate 실행 안에서 앞 마이그레이션이 방금 끝났다면, 그 사이에 묶음 규칙을
-- 아는 앱이 응답을 받을 수 없었다 — 마이그레이션이 성공해야 새 앱이 뜨기 때문이다.
-- 그때만 연다. 근거가 없으면 추정하지 않고 배포를 세운다.
DO $$
DECLARE
  sticky_applied_at timestamptz;
  at_risk_surveys   integer;
BEGIN
  -- 이 마이그레이션이 실제로 바꿀 행이 있는 설문.
  -- 예전 기준(3건 이상)으로는 전부 보였는데 아직 안 열린 행이 남아 있는 것들이다.
  SELECT count(*) INTO at_risk_surveys
  FROM (
    SELECT "surveyId"
    FROM "survey_response"
    GROUP BY "surveyId"
    HAVING count(*) >= 3 AND count(*) FILTER (WHERE NOT "revealed") > 0
  ) s;

  -- 바꿀 것이 없으면 이력을 따질 필요도 없다.
  -- 응답이 없는 DB(새로 만든 DB, CI, 응답 0건인 운영)는 전부 여기서 끝난다.
  IF at_risk_surveys = 0 THEN
    RETURN;
  END IF;

  IF to_regclass('_prisma_migrations') IS NOT NULL THEN
    SELECT max(finished_at) INTO sticky_applied_at
    FROM _prisma_migrations
    WHERE migration_name = '20260910072918_survey_response_sticky_reveal'
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL;
  END IF;

  IF sticky_applied_at IS NOT NULL AND now() - sticky_applied_at <= interval '15 minutes' THEN
    UPDATE "survey_response"
    SET "revealed" = true
    WHERE "surveyId" IN (
      SELECT "surveyId"
      FROM "survey_response"
      GROUP BY "surveyId"
      HAVING count(*) >= 3
    );
    RETURN;
  END IF;

  RAISE EXCEPTION
    '설문 % 개에서 예전 공개분과 신규 응답을 구분할 수 없습니다.', at_risk_surveys
    USING
      DETAIL =
        '20260910072918_survey_response_sticky_reveal 가 이 DB 에 적용된 시각('
        || coalesce(sticky_applied_at::text, '기록 없음')
        || ') 이 이번 실행과 떨어져 있습니다. 그 사이 묶음 규칙을 아는 앱이 받은 응답이 섞여 있으면, 여기서 전부 공개하는 순간 늘어난 한 건이 곧 신규 응답이 됩니다.',
      HINT =
        '선택지: (1) 이 DB 에 아직 새 응답이 들어온 적이 없음이 확인되면 '
        || '20260910072918 적용 이후의 응답 유입 여부를 근거로 남기고 해당 행을 직접 공개한다. '
        || '(2) 검증용 DB 라면 설문 응답을 비우고 다시 적용한다. '
        || '(3) 구분할 근거가 없으면 이 설문들은 열지 않은 채 두고 docs/HANDOFF.md 에 적어 사람이 정한다.';
END $$;
