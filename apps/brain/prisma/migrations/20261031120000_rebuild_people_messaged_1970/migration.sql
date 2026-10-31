-- People whose only reason was the "Messaged" fallback dated 1970 (an accepted request or a planned invite with nothing else)
-- are marked for one rebuild by the people-index job, which now gives them the request's or invite's reason. Marks only.

INSERT INTO "PeopleIndexDirty" ("userId", "slug")
SELECT DISTINCT "userId", "slug" FROM "Person"
WHERE "reasonKind" = 'CONVERSATION' AND "reasonAt" < '1971-01-01'
ON CONFLICT DO NOTHING;
