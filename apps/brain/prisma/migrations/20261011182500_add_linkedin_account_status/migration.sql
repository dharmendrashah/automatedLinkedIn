-- CreateEnum
CREATE TYPE "LinkedInAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'NEEDS_REAUTH', 'ERROR', 'DISABLED');

-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "status" "LinkedInAccountStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "statusMessage" TEXT,
ADD COLUMN     "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
