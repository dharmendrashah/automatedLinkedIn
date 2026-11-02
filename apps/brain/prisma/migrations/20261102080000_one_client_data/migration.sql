-- One client per owner (.plan/single-client.md), step 1 of 2: data only, plus one additive column. Everything an owner has is already
-- scoped by `userId`; this prepares the data for the migration that drops `Client` and every `clientId`:
--   * a person who exists in more than one client becomes one row (the default client's row is kept);
--   * a person with a live invite in more than one client keeps the oldest one live;
--   * "new since you last looked" on My network moves from the client to the user.
-- Safe to run twice: the second run finds nothing to merge. Prisma does not roll back a script that fails half way, so it is one
-- transaction.
BEGIN;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "peopleSeenAt" TIMESTAMP(3);

-- The newest "last looked" of the owner's clients: the least surprising for people first seen since.
UPDATE "User" u
SET "peopleSeenAt" = c."seenAt"
FROM (SELECT "userId", max("seenAt") AS "seenAt" FROM "Client" GROUP BY "userId") c
WHERE c."userId" = u."id" AND c."seenAt" IS NOT NULL AND u."peopleSeenAt" IS NULL;

-- People of the same owner and profile in several clients: the row of the default client is kept, else the oldest.
CREATE TEMP TABLE one_person_group ON COMMIT DROP AS
SELECT "id", "userId", "slug", "keepId"
FROM (
    SELECT p."id", p."userId", p."slug",
        first_value(p."id") OVER (PARTITION BY p."userId", p."slug" ORDER BY c."isDefault" DESC, p."createdAt", p."id") AS "keepId",
        count(*) OVER (PARTITION BY p."userId", p."slug") AS "rows"
    FROM "Person" p
    JOIN "Client" c ON c."id" = p."clientId"
) grouped
WHERE "rows" > 1;

CREATE TEMP TABLE one_person_labels ON COMMIT DROP AS
SELECT g."keepId", array_agg(DISTINCT l ORDER BY l) AS "labels"
FROM one_person_group g
JOIN "Person" p ON p."id" = g."id"
CROSS JOIN LATERAL unnest(p."labels") AS l
GROUP BY g."keepId";

CREATE TEMP TABLE one_person_notes ON COMMIT DROP AS
SELECT "keepId", string_agg("notes", E'\n' ORDER BY "first") AS "notes"
FROM (
    SELECT g."keepId", p."notes", min(p."createdAt") AS "first"
    FROM one_person_group g
    JOIN "Person" p ON p."id" = g."id"
    WHERE btrim(coalesce(p."notes", '')) <> ''
    GROUP BY g."keepId", p."notes"
) distinct_notes
GROUP BY "keepId";

-- The furthest status wins (Replied over Contacted over New; Not interested and Done, which the owner chose, over all); of two chosen
-- ones the newer. Do not contact if any client set it. The oldest first seen.
CREATE TEMP TABLE one_person_merged ON COMMIT DROP AS
SELECT g."keepId",
    (array_agg(p."status" ORDER BY CASE p."status" WHEN 'NEW' THEN 0 WHEN 'CONTACTED' THEN 1 WHEN 'REPLIED' THEN 2 ELSE 3 END DESC, p."statusSetAt" DESC NULLS LAST, p."id"))[1] AS "status",
    (array_agg(p."statusSetAt" ORDER BY CASE p."status" WHEN 'NEW' THEN 0 WHEN 'CONTACTED' THEN 1 WHEN 'REPLIED' THEN 2 ELSE 3 END DESC, p."statusSetAt" DESC NULLS LAST, p."id"))[1] AS "statusSetAt",
    bool_or(p."doNotContact") AS "doNotContact",
    min(p."firstSeenAt") AS "firstSeenAt"
FROM one_person_group g
JOIN "Person" p ON p."id" = g."id"
GROUP BY g."keepId";

UPDATE "Person" k
SET "status" = m."status",
    "statusSetAt" = m."statusSetAt",
    "doNotContact" = m."doNotContact",
    "firstSeenAt" = m."firstSeenAt",
    "labels" = coalesce(l."labels", k."labels"),
    "notes" = coalesce(n."notes", k."notes")
FROM one_person_merged m
LEFT JOIN one_person_labels l ON l."keepId" = m."keepId"
LEFT JOIN one_person_notes n ON n."keepId" = m."keepId"
WHERE k."id" = m."keepId";

-- Their ties follow the kept row (a tie it already has stays as it is); the other rows go, and what is left of their ties with them.
UPDATE "PersonLink" l
SET "personId" = g."keepId"
FROM one_person_group g
WHERE l."personId" = g."id" AND g."id" <> g."keepId"
    AND NOT EXISTS (
        SELECT 1 FROM "PersonLink" x WHERE x."personId" = g."keepId" AND x."kind" = l."kind" AND x."sourceId" = l."sourceId"
    );

DELETE FROM "Person" WHERE "id" IN (SELECT "id" FROM one_person_group WHERE "id" <> "keepId");

-- The index refreshes what it derives (priority, found by, invite state) for the people that were merged.
INSERT INTO "PeopleIndexDirty" ("userId", "slug")
SELECT DISTINCT "userId", "slug" FROM one_person_group
ON CONFLICT ("userId", "slug") DO UPDATE SET "createdAt" = CURRENT_TIMESTAMP;

-- One live invite per owner and person: the oldest stays, a younger one in another client ends as skipped.
UPDATE "LinkedInInvite" i
SET "state" = 'SKIPPED',
    "reason" = 'Merged into one workspace: another invite to this person was already live.'
FROM (
    SELECT "id", row_number() OVER (PARTITION BY "userId", "slug" ORDER BY "createdAt", "id") AS "place"
    FROM "LinkedInInvite"
    WHERE "state" IN ('QUEUED', 'SENDING', 'SENT', 'UNKNOWN', 'WITHDRAW_QUEUED', 'WITHDRAWING')
) live
WHERE i."id" = live."id" AND live."place" > 1;

COMMIT;
