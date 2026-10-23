-- CreateEnum
CREATE TYPE "LinkedInReplyState" AS ENUM ('SENDING', 'SENT', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "LinkedInReply" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "state" "LinkedInReplyState" NOT NULL DEFAULT 'SENDING',
    "failure" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "LinkedInReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInReply_sessionId_key" ON "LinkedInReply"("sessionId");

-- CreateIndex
CREATE INDEX "LinkedInReply_accountId_createdAt_idx" ON "LinkedInReply"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LinkedInReply_conversationId_createdAt_idx" ON "LinkedInReply"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "LinkedInReply_state_createdAt_idx" ON "LinkedInReply"("state", "createdAt");

-- AddForeignKey
ALTER TABLE "LinkedInReply" ADD CONSTRAINT "LinkedInReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInReply" ADD CONSTRAINT "LinkedInReply_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInReply" ADD CONSTRAINT "LinkedInReply_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "LinkedInConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One reply at a time per account: a second one that starts while one is being typed is refused by the database, not only by the service.
CREATE UNIQUE INDEX "LinkedInReply_accountId_sending_key" ON "LinkedInReply"("accountId") WHERE "state" = 'SENDING';
