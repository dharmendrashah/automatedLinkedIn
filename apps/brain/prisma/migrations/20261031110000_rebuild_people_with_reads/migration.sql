-- The people index now shows a profile read's name, headline, photo and company first (.plan/network-drawer-redesign.md):
-- every person with a stored read is marked for one rebuild by the people-index job. Marks only; no row is changed here.

INSERT INTO "PeopleIndexDirty" ("userId", "slug")
SELECT DISTINCT "userId", "slug" FROM "PersonSnapshot"
ON CONFLICT DO NOTHING;
