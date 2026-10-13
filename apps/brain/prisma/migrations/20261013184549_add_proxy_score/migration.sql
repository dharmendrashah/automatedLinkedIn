-- AlterTable
ALTER TABLE "ProxyServer" ADD COLUMN     "abuseCheckedAt" TIMESTAMP(3),
ADD COLUMN     "abuseError" TEXT,
ADD COLUMN     "abuseIp" TEXT,
ADD COLUMN     "abuseIsTor" BOOLEAN,
ADD COLUMN     "abuseIsp" TEXT,
ADD COLUMN     "abuseLastReportedAt" TIMESTAMP(3),
ADD COLUMN     "abuseReports" INTEGER,
ADD COLUMN     "abuseScore" INTEGER,
ADD COLUMN     "abuseUsageType" TEXT,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "scoreHasReputation" BOOLEAN,
ADD COLUMN     "scoredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProxyScore" (
    "id" TEXT NOT NULL,
    "proxyServerId" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "abuseScore" INTEGER,
    "latencyMs" INTEGER,
    "reputationChecked" BOOLEAN NOT NULL,
    "status" "ProxyServerStatus" NOT NULL,

    CONSTRAINT "ProxyScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProxyScore_proxyServerId_scoredAt_idx" ON "ProxyScore"("proxyServerId", "scoredAt");

-- CreateIndex
CREATE INDEX "ProxyScore_scoredAt_idx" ON "ProxyScore"("scoredAt");

-- CreateIndex
CREATE INDEX "ProxyServer_scoredAt_idx" ON "ProxyServer"("scoredAt");

-- AddForeignKey
ALTER TABLE "ProxyScore" ADD CONSTRAINT "ProxyScore_proxyServerId_fkey" FOREIGN KEY ("proxyServerId") REFERENCES "ProxyServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
