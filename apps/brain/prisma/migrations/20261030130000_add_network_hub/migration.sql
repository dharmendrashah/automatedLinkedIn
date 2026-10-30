-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('NEW', 'CONTACTED', 'REPLIED', 'NOT_INTERESTED', 'DONE');

-- CreateEnum
CREATE TYPE "PersonFit" AS ENUM ('STRONG', 'MAYBE', 'NONE');

-- CreateEnum
CREATE TYPE "PersonLinkKind" AS ENUM ('REQUEST', 'CONNECTION', 'CONVERSATION', 'LIST_MEMBER', 'TARGET');

-- AlterTable
ALTER TABLE "DataRead" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "LinkedInProfile" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "SpendLedger" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "WorkflowList" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT,
    "headline" TEXT,
    "company" TEXT,
    "photoUrl" TEXT,
    "status" "PersonStatus" NOT NULL DEFAULT 'NEW',
    "statusSetAt" TIMESTAMP(3),
    "labels" TEXT[],
    "notes" TEXT,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "fit" "PersonFit" NOT NULL DEFAULT 'NONE',
    "score" INTEGER,
    "reasonKind" "PersonLinkKind",
    "reasonText" TEXT,
    "reasonUrl" TEXT,
    "reasonAt" TIMESTAMP(3),
    "foundBy" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "waiting" BOOLEAN NOT NULL DEFAULT false,
    "lastTouchAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, coalesce("name", '') || ' ' || coalesce("headline", '') || ' ' || coalesce("company", '') || ' ' || "slug")) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonLink" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "accountId" TEXT,
    "kind" "PersonLinkKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeopleIndexDirty" (
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeopleIndexDirty_pkey" PRIMARY KEY ("userId","slug")
);

-- CreateTable
CREATE TABLE "PeopleExport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "refused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeopleExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonErasure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonErasure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_name_key" ON "Client"("userId", "name");

-- CreateIndex
CREATE INDEX "Person_clientId_priority_lastTouchAt_id_idx" ON "Person"("clientId", "priority", "lastTouchAt", "id");

-- CreateIndex
CREATE INDEX "Person_clientId_waiting_lastTouchAt_id_idx" ON "Person"("clientId", "waiting", "lastTouchAt", "id");

-- CreateIndex
CREATE INDEX "Person_clientId_lastTouchAt_id_idx" ON "Person"("clientId", "lastTouchAt", "id");

-- CreateIndex
CREATE INDEX "Person_clientId_firstSeenAt_idx" ON "Person"("clientId", "firstSeenAt");

-- CreateIndex
CREATE INDEX "Person_userId_slug_idx" ON "Person"("userId", "slug");

-- CreateIndex
CREATE INDEX "Person_foundBy_idx" ON "Person" USING GIN ("foundBy");

-- CreateIndex
CREATE INDEX "Person_labels_idx" ON "Person" USING GIN ("labels");

-- CreateIndex
CREATE INDEX "Person_search_idx" ON "Person" USING GIN ("search");

-- CreateIndex
CREATE UNIQUE INDEX "Person_clientId_slug_key" ON "Person"("clientId", "slug");

-- CreateIndex
CREATE INDEX "PersonLink_accountId_personId_idx" ON "PersonLink"("accountId", "personId");

-- CreateIndex
CREATE INDEX "PersonLink_sourceId_idx" ON "PersonLink"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonLink_personId_kind_sourceId_key" ON "PersonLink"("personId", "kind", "sourceId");

-- CreateIndex
CREATE INDEX "PeopleIndexDirty_createdAt_idx" ON "PeopleIndexDirty"("createdAt");

-- CreateIndex
CREATE INDEX "PeopleExport_userId_createdAt_idx" ON "PeopleExport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonErasure_userId_createdAt_idx" ON "PersonErasure"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LinkedInConnection_userId_slug_idx" ON "LinkedInConnection"("userId", "slug");

-- CreateIndex
CREATE INDEX "LinkedInInvitation_userId_slug_idx" ON "LinkedInInvitation"("userId", "slug");

-- CreateIndex
CREATE INDEX "SpendLedger_clientId_month_idx" ON "SpendLedger"("clientId", "month");

-- AddForeignKey
ALTER TABLE "WorkflowList" ADD CONSTRAINT "WorkflowList_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInProfile" ADD CONSTRAINT "LinkedInProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInAccount" ADD CONSTRAINT "LinkedInAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLink" ADD CONSTRAINT "PersonLink_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLink" ADD CONSTRAINT "PersonLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A default client for every owner who has accounts, lists or targets; null client ids point to it.
INSERT INTO "Client" ("id", "userId", "name", "isDefault", "updatedAt")
SELECT gen_random_uuid()::text, owners."userId", 'My accounts', true, CURRENT_TIMESTAMP
FROM (
    SELECT "userId" FROM "LinkedInAccount"
    UNION SELECT "userId" FROM "WorkflowList"
    UNION SELECT "userId" FROM "LinkedInProfile"
) owners;

-- One client per distinct note on the accounts (one client per account), and the accounts moved to it.
INSERT INTO "Client" ("id", "userId", "name", "isDefault", "updatedAt")
SELECT gen_random_uuid()::text, labels."userId", labels."name", false, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "userId", btrim("clientLabel") AS "name" FROM "LinkedInAccount" WHERE btrim(coalesce("clientLabel", '')) <> ''
) labels
ON CONFLICT ("userId", "name") DO NOTHING;

UPDATE "LinkedInAccount" a
SET "clientId" = c."id"
FROM "Client" c
WHERE c."userId" = a."userId" AND c."name" = btrim(a."clientLabel") AND NOT c."isDefault";

-- My network's index (.plan/network-hub.md): every write to a row that ties a profile to the owner marks that profile, and the
-- people-index job rebuilds the marked ones. Triggers catch every path (services, raw SQL, cascades) with no code in them.
CREATE FUNCTION people_index_mark(owner TEXT, profile TEXT) RETURNS void LANGUAGE sql AS $$
    INSERT INTO "PeopleIndexDirty" ("userId", "slug")
    SELECT owner, profile WHERE owner IS NOT NULL AND profile IS NOT NULL AND profile <> ''
    -- A newer mark moves the time, so the job never clears a change it did not see.
    ON CONFLICT ("userId", "slug") DO UPDATE SET "createdAt" = CURRENT_TIMESTAMP;
$$;

CREATE FUNCTION people_index_by_owner_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        PERFORM people_index_mark(OLD."userId", OLD."slug");
    END IF;
    IF TG_OP <> 'DELETE' THEN
        PERFORM people_index_mark(NEW."userId", NEW."slug");
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER people_index AFTER INSERT OR UPDATE OR DELETE ON "LinkedInInvitation" FOR EACH ROW EXECUTE FUNCTION people_index_by_owner_slug();
CREATE TRIGGER people_index AFTER INSERT OR UPDATE OR DELETE ON "LinkedInConnection" FOR EACH ROW EXECUTE FUNCTION people_index_by_owner_slug();
CREATE TRIGGER people_index AFTER INSERT OR UPDATE OR DELETE ON "LinkedInProfile" FOR EACH ROW EXECUTE FUNCTION people_index_by_owner_slug();
CREATE TRIGGER people_index AFTER INSERT OR UPDATE OR DELETE ON "Suppression" FOR EACH ROW EXECUTE FUNCTION people_index_by_owner_slug();

-- A conversation names its person by profile address, or, when begun by a first message, through the reply that began it.
CREATE FUNCTION people_index_conversation_slug(conversation TEXT, url TEXT) RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        nullif(substring(url FROM '/in/((?!ACo)[^/?#]+)'), ''),
        (SELECT "recipientSlug" FROM "LinkedInReply" WHERE "conversationId" = conversation AND "recipientSlug" IS NOT NULL LIMIT 1)
    );
$$;

CREATE FUNCTION people_index_by_conversation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        PERFORM people_index_mark(OLD."userId", people_index_conversation_slug(OLD."id", OLD."contactProfileUrl"));
    END IF;
    IF TG_OP <> 'DELETE' THEN
        PERFORM people_index_mark(NEW."userId", people_index_conversation_slug(NEW."id", NEW."contactProfileUrl"));
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER people_index AFTER INSERT OR UPDATE OR DELETE ON "LinkedInConversation" FOR EACH ROW EXECUTE FUNCTION people_index_by_conversation();

CREATE FUNCTION people_index_by_reply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM people_index_mark(NEW."userId", NEW."recipientSlug");
    RETURN NULL;
END $$;

CREATE TRIGGER people_index AFTER INSERT OR UPDATE OF "conversationId", "recipientSlug", "state" ON "LinkedInReply" FOR EACH ROW EXECUTE FUNCTION people_index_by_reply();

-- A list member's owner is its list's. A list being deleted marks its members first (its row is gone when theirs go).
CREATE FUNCTION people_index_by_member() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        PERFORM people_index_mark((SELECT "userId" FROM "WorkflowList" WHERE "id" = OLD."listId"), OLD."slug");
    END IF;
    IF TG_OP <> 'DELETE' THEN
        PERFORM people_index_mark((SELECT "userId" FROM "WorkflowList" WHERE "id" = NEW."listId"), NEW."slug");
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER people_index AFTER INSERT OR UPDATE OR DELETE ON "WorkflowListMember" FOR EACH ROW EXECUTE FUNCTION people_index_by_member();

CREATE FUNCTION people_index_by_list() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO "PeopleIndexDirty" ("userId", "slug")
    SELECT OLD."userId", m."slug" FROM "WorkflowListMember" m WHERE m."listId" = OLD."id"
    ON CONFLICT DO NOTHING;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER people_index BEFORE DELETE OR UPDATE OF "clientId" ON "WorkflowList" FOR EACH ROW EXECUTE FUNCTION people_index_by_list();

-- An account moved to another client moves its people with it.
CREATE FUNCTION people_index_by_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO "PeopleIndexDirty" ("userId", "slug")
    SELECT NEW."userId", s."slug" FROM (
        SELECT "slug" FROM "LinkedInInvitation" WHERE "accountId" = NEW."id"
        UNION SELECT "slug" FROM "LinkedInConnection" WHERE "accountId" = NEW."id"
        UNION SELECT people_index_conversation_slug("id", "contactProfileUrl") FROM "LinkedInConversation" WHERE "accountId" = NEW."id"
    ) s
    WHERE s."slug" IS NOT NULL
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

CREATE TRIGGER people_index AFTER UPDATE OF "clientId" ON "LinkedInAccount" FOR EACH ROW WHEN (OLD."clientId" IS DISTINCT FROM NEW."clientId") EXECUTE FUNCTION people_index_by_account();

-- The first build: every profile the owner has a row for.
INSERT INTO "PeopleIndexDirty" ("userId", "slug")
SELECT "userId", "slug" FROM "LinkedInInvitation"
UNION SELECT "userId", "slug" FROM "LinkedInConnection"
UNION SELECT "userId", "slug" FROM "LinkedInProfile"
UNION SELECT "userId", "slug" FROM "Suppression"
UNION SELECT l."userId", m."slug" FROM "WorkflowListMember" m JOIN "WorkflowList" l ON l."id" = m."listId"
UNION SELECT "userId", people_index_conversation_slug("id", "contactProfileUrl") FROM "LinkedInConversation" WHERE "kind" = 'DIRECT'
ON CONFLICT DO NOTHING;

DELETE FROM "PeopleIndexDirty" WHERE "slug" IS NULL OR "slug" = '';

