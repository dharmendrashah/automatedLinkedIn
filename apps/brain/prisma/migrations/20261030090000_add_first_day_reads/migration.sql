-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "firstSignedInAt" TIMESTAMP(3),
ADD COLUMN     "nextFirstReadAt" TIMESTAMP(3),
ADD COLUMN     "nextConnectionsAt" TIMESTAMP(3),
ADD COLUMN     "nextProfileAt" TIMESTAMP(3);
