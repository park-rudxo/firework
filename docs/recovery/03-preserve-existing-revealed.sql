-- Manual recovery; verified backup IDs only. Never infer IDs from current counts.
-- Use one dedicated connection. Fill this temporary manifest before BEGIN.
-- Evidence is reviewed by the operator, not proven by SQL. Do not commit IDs to Git.
CREATE TEMP TABLE IF NOT EXISTS verified_reveal_manifest (
  response_id text PRIMARY KEY,
  survey_id text NOT NULL,
  evidence text NOT NULL CHECK (length(btrim(evidence)) > 0)
);
-- INSERT INTO verified_reveal_manifest VALUES ('verified-id','survey-id','backup reference');
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE survey_response IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM verified_reveal_manifest) THEN
    RAISE EXCEPTION 'Verified response manifest is empty';
  END IF;
  IF EXISTS (
    SELECT 1 FROM verified_reveal_manifest m
    LEFT JOIN survey_response r ON r.id=m.response_id AND r."surveyId"=m.survey_id
    WHERE r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Missing or mismatched response IDs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM verified_reveal_manifest m
    WHERE (SELECT count(*) FROM survey_response r WHERE r."surveyId"=m.survey_id) < 3
  ) THEN
    RAISE EXCEPTION 'Survey below historical disclosure threshold';
  END IF;
END $$;
UPDATE survey_response r SET revealed=true
FROM verified_reveal_manifest m
WHERE r.id=m.response_id AND r."surveyId"=m.survey_id AND NOT r.revealed;
SELECT count(*) AS verified_rows, count(*) FILTER (WHERE r.revealed) AS revealed_verified_rows
FROM verified_reveal_manifest m
JOIN survey_response r ON r.id=m.response_id AND r."surveyId"=m.survey_id;
-- Dry-run default. Review the manifest/result, then rerun the WHOLE transaction
-- replacing only the final ROLLBACK with COMMIT. Locks/validation repeat.
-- On errors ROLLBACK before reuse. Never reveal unlisted rows to pass the guard.
ROLLBACK;
