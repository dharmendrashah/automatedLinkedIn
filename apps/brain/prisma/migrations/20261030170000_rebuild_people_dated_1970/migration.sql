-- People whose reason or touch was dated 1970 (a message time LinkedIn did not give) are rebuilt once by the people-index job,
-- which now leaves such times out (.plan/network-person-drawer.md). Marks only; no row is changed here.

INSERT INTO "PeopleIndexDirty" ("userId", "slug")
SELECT DISTINCT "userId", "slug" FROM "Person"
WHERE "reasonAt" < '2003-05-05' OR "lastTouchAt" < '2003-05-05' OR "lastSentAt" < '2003-05-05' OR "lastReceivedAt" < '2003-05-05'
ON CONFLICT DO NOTHING;
