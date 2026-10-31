-- Invites asked before a name was known carry the profile address as their name (.plan/invite-names.md): they take the name My
-- network has for the person now. People who took such an address as their name are marked for one rebuild, which ignores it.

UPDATE "LinkedInInvite" i
SET "name" = p."name"
FROM "Person" p
WHERE p."clientId" = i."clientId" AND p."slug" = i."slug" AND i."name" = i."slug"
  AND p."name" IS NOT NULL AND p."name" <> p."slug";

INSERT INTO "PeopleIndexDirty" ("userId", "slug")
SELECT DISTINCT "userId", "slug" FROM "Person" WHERE "name" = "slug"
ON CONFLICT DO NOTHING;
