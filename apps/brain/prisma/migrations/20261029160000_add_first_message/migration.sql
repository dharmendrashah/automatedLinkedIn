-- A first message to a connection (.plan/message-connections.md): a reply row with no conversation until the run's conversation is stored.
ALTER TABLE "LinkedInReply" ALTER COLUMN "conversationId" DROP NOT NULL;
ALTER TABLE "LinkedInReply" ADD COLUMN "recipientSlug" TEXT;
ALTER TABLE "LinkedInReply" ADD COLUMN "recipientName" TEXT;

CREATE INDEX "LinkedInReply_accountId_recipientSlug_idx" ON "LinkedInReply"("accountId", "recipientSlug");
