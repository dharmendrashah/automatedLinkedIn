-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "messagesBackfilledAt" TIMESTAMP(3),
ADD COLUMN     "messagesSweptAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LinkedInConversation" ADD COLUMN     "rowHash" TEXT;
