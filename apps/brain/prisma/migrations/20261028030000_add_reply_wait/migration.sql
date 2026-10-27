-- AlterTable
ALTER TABLE "LinkedInReply" ADD COLUMN     "waitReason" TEXT,
ADD COLUMN     "waitUntil" TIMESTAMP(3),
ADD COLUMN     "waitZone" TEXT;
