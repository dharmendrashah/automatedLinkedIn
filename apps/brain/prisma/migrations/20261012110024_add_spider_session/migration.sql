-- CreateEnum
CREATE TYPE "SpiderSessionKind" AS ENUM ('VALIDATE_ACCOUNT', 'SCRAPE');

-- CreateEnum
CREATE TYPE "SpiderSessionStatus" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "SpiderSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linkedInAccountId" TEXT NOT NULL,
    "kind" "SpiderSessionKind" NOT NULL,
    "status" "SpiderSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "outcome" TEXT,
    "message" TEXT,
    "proxyServerId" TEXT,
    "proxyProtocol" "ProxyProtocol",
    "proxyHost" TEXT,
    "proxyPort" INTEGER,
    "proxyCountry" TEXT,
    "requestParams" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "recordingPrefix" TEXT,
    "retryOfId" TEXT,

    CONSTRAINT "SpiderSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpiderSession_userId_startedAt_idx" ON "SpiderSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "SpiderSession_linkedInAccountId_startedAt_idx" ON "SpiderSession"("linkedInAccountId", "startedAt");

-- AddForeignKey
ALTER TABLE "SpiderSession" ADD CONSTRAINT "SpiderSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpiderSession" ADD CONSTRAINT "SpiderSession_linkedInAccountId_fkey" FOREIGN KEY ("linkedInAccountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpiderSession" ADD CONSTRAINT "SpiderSession_proxyServerId_fkey" FOREIGN KEY ("proxyServerId") REFERENCES "ProxyServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpiderSession" ADD CONSTRAINT "SpiderSession_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "SpiderSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
