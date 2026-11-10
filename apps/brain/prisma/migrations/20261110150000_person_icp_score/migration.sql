-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "icpScore" INTEGER,
ADD COLUMN     "icpScoreReasons" JSONB,
ADD COLUMN     "icpScoreIcpId" TEXT,
ADD COLUMN     "icpScoreIcpName" TEXT,
ADD COLUMN     "icpScoredAt" TIMESTAMP(3),
ADD COLUMN     "icpScoreWaitingFor" TEXT;
