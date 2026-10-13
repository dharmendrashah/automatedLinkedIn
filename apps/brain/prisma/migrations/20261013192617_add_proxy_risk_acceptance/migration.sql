-- AlterTable
ALTER TABLE "ProxyServer" ADD COLUMN     "riskAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "riskAcceptedIssues" TEXT[] DEFAULT ARRAY[]::TEXT[];
