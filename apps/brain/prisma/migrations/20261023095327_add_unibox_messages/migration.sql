-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('ME', 'THEM');

-- CreateEnum
CREATE TYPE "MessageImportStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "messagesReadAt" TIMESTAMP(3),
ADD COLUMN     "nextMessagesAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LinkedInConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "linkedInId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "participants" JSONB NOT NULL,
    "contactProfileUrl" TEXT,
    "unread" BOOLEAN NOT NULL,
    "complete" BOOLEAN NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastDirection" "MessageDirection",
    "waitingSince" TIMESTAMP(3),
    "lastReplyAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedInMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "linkedInId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderProfileUrl" TEXT,
    "sentAt" TIMESTAMP(3),
    "whenText" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachments" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedInMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageImport" (
    "sessionId" TEXT NOT NULL,
    "status" "MessageImportStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "MessageImport_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE INDEX "LinkedInConversation_userId_lastMessageAt_idx" ON "LinkedInConversation"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "LinkedInConversation_userId_contactProfileUrl_idx" ON "LinkedInConversation"("userId", "contactProfileUrl");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInConversation_accountId_linkedInId_key" ON "LinkedInConversation"("accountId", "linkedInId");

-- CreateIndex
CREATE INDEX "LinkedInMessage_conversationId_position_idx" ON "LinkedInMessage"("conversationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInMessage_conversationId_linkedInId_key" ON "LinkedInMessage"("conversationId", "linkedInId");

-- CreateIndex
CREATE INDEX "MessageImport_status_nextAttemptAt_idx" ON "MessageImport"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "LinkedInConversation" ADD CONSTRAINT "LinkedInConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInConversation" ADD CONSTRAINT "LinkedInConversation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInMessage" ADD CONSTRAINT "LinkedInMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "LinkedInConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageImport" ADD CONSTRAINT "MessageImport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpiderSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
