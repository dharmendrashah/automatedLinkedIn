-- Makes the people askable again whose invite ended "no Connect button" because the task never opened the profile's More menu
-- (one-time data change; safe to run again). From 10 Nov the task could not recognise the icon-only More button, so a profile whose
-- Connect was only in that menu was answered NO_CONNECT, the invite FAILED and the person ENDED for good. The rows become SKIPPED,
-- which leaves the person with no invite, and the people index is told to rebuild them. A person with no Connect even in the menu
-- ends the same way again after one more visit.
WITH reopened AS (
  UPDATE "LinkedInInvite"
  SET "state" = 'SKIPPED',
      "reason" = 'Asked again after the More menu fix.'
  WHERE "state" = 'FAILED'
    AND "reason" = 'LinkedIn showed no Connect button on the profile. Nothing was sent.'
    AND "createdAt" >= TIMESTAMP '2026-11-10 00:00:00'
  RETURNING "userId", "slug"
)
INSERT INTO "PeopleIndexDirty" ("userId", "slug")
SELECT DISTINCT "userId", "slug" FROM reopened
ON CONFLICT ("userId", "slug") DO UPDATE SET "createdAt" = CURRENT_TIMESTAMP;
