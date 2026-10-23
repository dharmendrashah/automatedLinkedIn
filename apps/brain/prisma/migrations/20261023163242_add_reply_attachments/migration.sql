-- AlterTable
ALTER TABLE "LinkedInReply" ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "filesDeletedAt" TIMESTAMP(3),
ADD COLUMN     "uploadId" TEXT;
