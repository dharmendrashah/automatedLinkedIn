/*
  Warnings:

  - You are about to drop the column `clientId` on the `DataRead` table. All the data in the column will be lost.
  - You are about to drop the column `clientId` on the `LinkedInAccount` table. All the data in the column will be lost.
  - You are about to drop the column `clientLabel` on the `LinkedInAccount` table. All the data in the column will be lost.
  - You are about to drop the column `clientId` on the `LinkedInInvite` table. All the data in the column will be lost.
  - You are about to drop the column `clientId` on the `LinkedInProfile` table. All the data in the column will be lost.
  - You are about to drop the column `clientId` on the `PeopleExport` table. All the data in the column will be lost.
  - You are about to drop the column `clientId` on the `Person` table. All the data in the column will be lost.
  - You are about to drop the column `clientId` on the `SpendLedger` table. All the data in the column will be lost.
  - You are about to drop the column `clientId` on the `WorkflowList` table. All the data in the column will be lost.
  - You are about to drop the `Client` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,slug]` on the table `Person` will be added. If there are existing duplicate values, this will fail.

*/
-- One client per owner (.plan/single-client.md), step 2 of 2: the client goes. The data was made ready by one_client_data. Prisma does not
-- roll back a script that fails half way, so it is one transaction.
BEGIN;

-- The triggers that name `clientId` go before the column does: an account no longer moves people between clients, and a list being
-- deleted still marks its members for the people index.
DROP TRIGGER people_index ON "LinkedInAccount";
DROP FUNCTION people_index_by_account();
DROP TRIGGER people_index ON "WorkflowList";
CREATE TRIGGER people_index BEFORE DELETE ON "WorkflowList" FOR EACH ROW EXECUTE FUNCTION people_index_by_list();

-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_userId_fkey";

-- DropForeignKey
ALTER TABLE "LinkedInAccount" DROP CONSTRAINT "LinkedInAccount_clientId_fkey";

-- DropForeignKey
ALTER TABLE "LinkedInInvite" DROP CONSTRAINT "LinkedInInvite_clientId_fkey";

-- DropForeignKey
ALTER TABLE "LinkedInProfile" DROP CONSTRAINT "LinkedInProfile_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Person" DROP CONSTRAINT "Person_clientId_fkey";

-- DropForeignKey
ALTER TABLE "WorkflowList" DROP CONSTRAINT "WorkflowList_clientId_fkey";

-- DropIndex
DROP INDEX "LinkedInInvite_clientId_invitedAt_idx";

-- DropIndex
DROP INDEX "LinkedInInvite_clientId_slug_idx";

-- DropIndex
DROP INDEX "Person_clientId_connectedAt_idx";

-- DropIndex
DROP INDEX "Person_clientId_country_idx";

-- DropIndex
DROP INDEX "Person_clientId_firstSeenAt_idx";

-- DropIndex
DROP INDEX "Person_clientId_lastReceivedAt_idx";

-- DropIndex
DROP INDEX "Person_clientId_lastSentAt_idx";

-- DropIndex
DROP INDEX "Person_clientId_lastTouchAt_id_idx";

-- DropIndex
DROP INDEX "Person_clientId_priority_lastTouchAt_id_idx";

-- DropIndex
DROP INDEX "Person_clientId_slug_key";

-- DropIndex
DROP INDEX "Person_clientId_waiting_lastTouchAt_id_idx";

-- DropIndex
DROP INDEX "Person_userId_slug_idx";

-- DropIndex
DROP INDEX "SpendLedger_clientId_month_idx";

-- AlterTable
ALTER TABLE "DataRead" DROP COLUMN "clientId";

-- AlterTable
ALTER TABLE "LinkedInAccount" DROP COLUMN "clientId",
DROP COLUMN "clientLabel";

-- AlterTable
ALTER TABLE "LinkedInInvite" DROP COLUMN "clientId";

-- AlterTable
ALTER TABLE "LinkedInProfile" DROP COLUMN "clientId";

-- AlterTable
ALTER TABLE "PeopleExport" DROP COLUMN "clientId";

-- AlterTable
ALTER TABLE "Person" DROP COLUMN "clientId";

-- AlterTable
ALTER TABLE "SpendLedger" DROP COLUMN "clientId";

-- AlterTable
ALTER TABLE "WorkflowList" DROP COLUMN "clientId";

-- DropTable
DROP TABLE "Client";

-- CreateIndex
CREATE INDEX "LinkedInInvite_userId_invitedAt_idx" ON "LinkedInInvite"("userId", "invitedAt");

-- CreateIndex
CREATE INDEX "Person_userId_priority_lastTouchAt_id_idx" ON "Person"("userId", "priority", "lastTouchAt", "id");

-- CreateIndex
CREATE INDEX "Person_userId_waiting_lastTouchAt_id_idx" ON "Person"("userId", "waiting", "lastTouchAt", "id");

-- CreateIndex
CREATE INDEX "Person_userId_lastTouchAt_id_idx" ON "Person"("userId", "lastTouchAt", "id");

-- CreateIndex
CREATE INDEX "Person_userId_firstSeenAt_idx" ON "Person"("userId", "firstSeenAt");

-- CreateIndex
CREATE INDEX "Person_userId_country_idx" ON "Person"("userId", "country");

-- CreateIndex
CREATE INDEX "Person_userId_connectedAt_idx" ON "Person"("userId", "connectedAt");

-- CreateIndex
CREATE INDEX "Person_userId_lastSentAt_idx" ON "Person"("userId", "lastSentAt");

-- CreateIndex
CREATE INDEX "Person_userId_lastReceivedAt_idx" ON "Person"("userId", "lastReceivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Person_userId_slug_key" ON "Person"("userId", "slug");

-- One live invite per owner and person: two tabs or two accounts never invite the same person. (The column drop removed the old one.)
CREATE UNIQUE INDEX "LinkedInInvite_one_live" ON "LinkedInInvite"("userId", "slug")
    WHERE "state" IN ('QUEUED', 'SENDING', 'SENT', 'UNKNOWN', 'WITHDRAW_QUEUED', 'WITHDRAWING');

COMMIT;
