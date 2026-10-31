-- Chats LinkedIn began name their person by member id (/in/ACoAA...), so the people index never tied them to a profile
-- (.plan/chats-by-name.md). The person is now the one profile of that exact name among the account's connections, sent invites
-- and requests, else the one My network person of that name; two of one name stay unknown. The Unibox uses the same rule.

CREATE FUNCTION people_index_slug_by_name(owner TEXT, account TEXT, person TEXT) RETURNS TEXT LANGUAGE sql STABLE AS $$
    WITH known AS (
        SELECT "slug" FROM "LinkedInConnection" WHERE "accountId" = account AND "name" = person
        UNION SELECT "slug" FROM "LinkedInInvite" WHERE "accountId" = account AND "name" = person
        UNION SELECT "slug" FROM "LinkedInInvitation" WHERE "accountId" = account AND "name" = person
    ), networked AS (
        SELECT DISTINCT "slug" FROM "Person" WHERE "userId" = owner AND "name" = person
    )
    SELECT CASE
        WHEN person IS NULL OR person = '' THEN NULL
        WHEN (SELECT count(*) FROM known) > 0 THEN (SELECT min("slug") FROM known HAVING count(*) = 1)
        ELSE (SELECT min("slug") FROM networked HAVING count(*) = 1)
    END;
$$;

CREATE OR REPLACE FUNCTION people_index_conversation_slug(conversation TEXT, url TEXT) RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        nullif(substring(url FROM '/in/((?!ACo)[^/?#]+)'), ''),
        (SELECT "recipientSlug" FROM "LinkedInReply" WHERE "conversationId" = conversation AND "recipientSlug" IS NOT NULL LIMIT 1),
        (
            SELECT people_index_slug_by_name(c."userId", c."accountId", c."participants" -> 0 ->> 'name')
            FROM "LinkedInConversation" c
            WHERE c."id" = conversation AND c."kind" = 'DIRECT'
        )
    );
$$;

INSERT INTO "PeopleIndexDirty" ("userId", "slug")
SELECT DISTINCT "userId", "slug" FROM (
    SELECT "userId", people_index_conversation_slug("id", "contactProfileUrl") AS "slug"
    FROM "LinkedInConversation"
    WHERE "kind" = 'DIRECT' AND "contactProfileUrl" LIKE '%/in/ACo%'
) named
WHERE "slug" IS NOT NULL
ON CONFLICT DO NOTHING;
