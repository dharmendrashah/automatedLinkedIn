-- CreateTable
CREATE TABLE "ProxyTest" (
    "id" TEXT NOT NULL,
    "proxyServerId" TEXT NOT NULL,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ProxyServerStatus" NOT NULL,
    "statusMessage" TEXT,
    "latencyMs" INTEGER,
    "requestMethod" TEXT NOT NULL,
    "requestUrl" TEXT NOT NULL,
    "requestHeaders" JSONB NOT NULL,
    "requestBody" TEXT,
    "responseStatus" INTEGER,
    "responseHeaders" JSONB,
    "responseBody" TEXT,
    "responseTruncated" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,

    CONSTRAINT "ProxyTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProxyTest_proxyServerId_testedAt_idx" ON "ProxyTest"("proxyServerId", "testedAt");

-- CreateIndex
CREATE INDEX "ProxyTest_testedAt_idx" ON "ProxyTest"("testedAt");

-- AddForeignKey
ALTER TABLE "ProxyTest" ADD CONSTRAINT "ProxyTest_proxyServerId_fkey" FOREIGN KEY ("proxyServerId") REFERENCES "ProxyServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
