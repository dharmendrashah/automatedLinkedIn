-- When the newest invite of the owner's accounts to a person went (.plan/lead-pipeline-p1-foundations.md): for the time frame
-- "Invited on" of a Profiles block and its filter on My network. Additive; existing people are filled from their invites.
ALTER TABLE "Person" ADD COLUMN "invitedAt" TIMESTAMP(3);

CREATE INDEX "Person_userId_invitedAt_idx" ON "Person"("userId", "invitedAt");

UPDATE "Person" p
SET "invitedAt" = i."at"
FROM (
   SELECT "userId", "slug", MAX("invitedAt") AS "at"
   FROM "LinkedInInvite"
   WHERE "state" IN ('SENT', 'UNKNOWN', 'WITHDRAW_QUEUED', 'WITHDRAWING', 'ACCEPTED', 'WITHDRAWN')
     AND "invitedAt" IS NOT NULL
   GROUP BY "userId", "slug"
) i
WHERE p."userId" = i."userId" AND p."slug" = i."slug";
