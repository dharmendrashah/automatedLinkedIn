-- CreateEnum
CREATE TYPE "PositiveReplyState" AS ENUM ('COUNTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "PositiveReplySource" AS ENUM ('RULES', 'AI', 'MARKED');

-- CreateEnum
CREATE TYPE "PositiveReplyCheckState" AS ENUM ('WAITING', 'DONE', 'SKIPPED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "replyValueUsd" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiReadsReplies" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PositiveReply" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "state" "PositiveReplyState" NOT NULL DEFAULT 'COUNTED',
    "source" "PositiveReplySource" NOT NULL,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositiveReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositiveReplyCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "state" "PositiveReplyCheckState" NOT NULL DEFAULT 'WAITING',
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositiveReplyCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PositiveReply_userId_campaignId_state_idx" ON "PositiveReply"("userId", "campaignId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "PositiveReply_campaignId_slug_key" ON "PositiveReply"("campaignId", "slug");

-- CreateIndex
CREATE INDEX "PositiveReplyCheck_state_createdAt_idx" ON "PositiveReplyCheck"("state", "createdAt");

-- CreateIndex
CREATE INDEX "PositiveReplyCheck_userId_state_idx" ON "PositiveReplyCheck"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "PositiveReplyCheck_messageId_campaignId_key" ON "PositiveReplyCheck"("messageId", "campaignId");

-- AddForeignKey
ALTER TABLE "PositiveReply" ADD CONSTRAINT "PositiveReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositiveReply" ADD CONSTRAINT "PositiveReply_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositiveReplyCheck" ADD CONSTRAINT "PositiveReplyCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositiveReplyCheck" ADD CONSTRAINT "PositiveReplyCheck_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

