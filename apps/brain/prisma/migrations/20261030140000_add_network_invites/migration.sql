-- My network, phase 2: connection invites (.plan/network-invites.md). Additive, in one transaction.
BEGIN;

-- CreateEnum
CREATE TYPE "LinkedInInviteState" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'ACCEPTED', 'WITHDRAW_QUEUED', 'WITHDRAWING', 'WITHDRAWN', 'FAILED', 'UNKNOWN', 'SKIPPED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PersonLinkKind" ADD VALUE 'INVITE';

-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "invitesStopReason" TEXT,
ADD COLUMN     "invitesStopUntil" TIMESTAMP(3),
ADD COLUMN     "invitesStoppedAt" TIMESTAMP(3),
ADD COLUMN     "nextAcceptReadAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LinkedInInvite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "memberId" TEXT,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "source" TEXT,
    "state" "LinkedInInviteState" NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "plannedAt" TIMESTAMP(3) NOT NULL,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "sessionId" TEXT,
    "waitReason" TEXT,
    "waitUntil" TIMESTAMP(3),
    "waitZone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "LinkedInInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteImport" (
    "sessionId" TEXT NOT NULL,
    "status" "MessageImportStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "InviteImport_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE INDEX "LinkedInInvite_accountId_state_plannedAt_idx" ON "LinkedInInvite"("accountId", "state", "plannedAt");

-- CreateIndex
CREATE INDEX "LinkedInInvite_accountId_startedAt_idx" ON "LinkedInInvite"("accountId", "startedAt");

-- CreateIndex
CREATE INDEX "LinkedInInvite_clientId_slug_idx" ON "LinkedInInvite"("clientId", "slug");

-- CreateIndex
CREATE INDEX "LinkedInInvite_clientId_invitedAt_idx" ON "LinkedInInvite"("clientId", "invitedAt");

-- CreateIndex
CREATE INDEX "LinkedInInvite_userId_slug_idx" ON "LinkedInInvite"("userId", "slug");

-- CreateIndex
CREATE INDEX "LinkedInInvite_sessionId_idx" ON "LinkedInInvite"("sessionId");

-- CreateIndex
CREATE INDEX "LinkedInInvite_state_invitedAt_idx" ON "LinkedInInvite"("state", "invitedAt");

-- CreateIndex
CREATE INDEX "InviteImport_status_nextAttemptAt_idx" ON "InviteImport"("status", "nextAttemptAt");

-- One live invite per client and person: two tabs or two accounts of a client never invite the same person.
CREATE UNIQUE INDEX "LinkedInInvite_one_live" ON "LinkedInInvite"("clientId", "slug")
    WHERE "state" IN ('QUEUED', 'SENDING', 'SENT', 'UNKNOWN', 'WITHDRAW_QUEUED', 'WITHDRAWING');

-- AddForeignKey
ALTER TABLE "LinkedInInvite" ADD CONSTRAINT "LinkedInInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInInvite" ADD CONSTRAINT "LinkedInInvite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInInvite" ADD CONSTRAINT "LinkedInInvite_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteImport" ADD CONSTRAINT "InviteImport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpiderSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- My network sees every change of an invite (people_index_by_owner_slug is from add_network_hub).
CREATE TRIGGER people_index AFTER INSERT OR UPDATE OF "state", "accountId" OR DELETE ON "LinkedInInvite" FOR EACH ROW EXECUTE FUNCTION people_index_by_owner_slug();

-- Needs me now holds replies (3), requests (2) and people ready to invite (1); every person is rebuilt so the last are found.
UPDATE "Person" SET "priority" = "priority" + 1 WHERE "priority" > 0;
INSERT INTO "PeopleIndexDirty" ("userId", "slug") SELECT DISTINCT "userId", "slug" FROM "Person" ON CONFLICT DO NOTHING;

COMMIT;
