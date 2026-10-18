-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkflowListMemberStatus" ADD VALUE 'CONTACTED';
ALTER TYPE "WorkflowListMemberStatus" ADD VALUE 'REPLIED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inboxSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkflowListMember" ADD COLUMN     "contactedAt" TIMESTAMP(3);
