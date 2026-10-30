-- My network filters (.plan/network-filters.md): what the filters read, kept on each person by the index. Additive only.

CREATE TYPE "PersonInviteState" AS ENUM ('NONE', 'QUEUED', 'PENDING', 'ACCEPTED', 'ENDED');

ALTER TABLE "Person"
    ADD COLUMN "title" TEXT,
    ADD COLUMN "country" TEXT,
    ADD COLUMN "premium" BOOLEAN,
    ADD COLUMN "profileRead" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "connectedAt" TIMESTAMP(3),
    ADD COLUMN "lastSentAt" TIMESTAMP(3),
    ADD COLUMN "lastReceivedAt" TIMESTAMP(3),
    ADD COLUMN "inviteState" "PersonInviteState" NOT NULL DEFAULT 'NONE';

CREATE INDEX "Person_clientId_country_idx" ON "Person"("clientId", "country");
CREATE INDEX "Person_clientId_connectedAt_idx" ON "Person"("clientId", "connectedAt");
CREATE INDEX "Person_clientId_lastSentAt_idx" ON "Person"("clientId", "lastSentAt");
CREATE INDEX "Person_clientId_lastReceivedAt_idx" ON "Person"("clientId", "lastReceivedAt");

-- A profile read brings the title and the country.
CREATE TRIGGER people_index AFTER INSERT OR UPDATE OR DELETE ON "PersonSnapshot" FOR EACH ROW EXECUTE FUNCTION people_index_by_owner_slug();

-- Every person is rebuilt once by the people-index job, which fills the new columns.
INSERT INTO "PeopleIndexDirty" ("userId", "slug") SELECT DISTINCT "userId", "slug" FROM "Person" ON CONFLICT DO NOTHING;
