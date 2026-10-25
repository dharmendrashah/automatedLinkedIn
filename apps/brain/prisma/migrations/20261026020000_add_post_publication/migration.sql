-- CreateEnum
CREATE TYPE "PostPublicationState" AS ENUM ('SCHEDULED', 'QUEUED', 'SENDING', 'POSTED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "PostPublication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "state" "PostPublicationState" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "plannedZone" TEXT,
    "failure" TEXT,
    "link" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "filesDeletedAt" TIMESTAMP(3),

    CONSTRAINT "PostPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostPublication_sessionId_key" ON "PostPublication"("sessionId");

-- CreateIndex
CREATE INDEX "PostPublication_userId_createdAt_idx" ON "PostPublication"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostPublication_accountId_state_idx" ON "PostPublication"("accountId", "state");

-- CreateIndex
CREATE INDEX "PostPublication_state_scheduledAt_idx" ON "PostPublication"("state", "scheduledAt");

-- One post at a time per account: a second row cannot be SENDING while another is.
CREATE UNIQUE INDEX "PostPublication_accountId_sending_key" ON "PostPublication"("accountId") WHERE "state" = 'SENDING';

-- AddForeignKey
ALTER TABLE "PostPublication" ADD CONSTRAINT "PostPublication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPublication" ADD CONSTRAINT "PostPublication_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
