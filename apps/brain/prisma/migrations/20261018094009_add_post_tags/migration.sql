-- AlterTable
ALTER TABLE "LinkedInPost" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
