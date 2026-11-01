-- AlterTable
ALTER TABLE "LinkedInProfile" ADD COLUMN     "email" TEXT,
ADD COLUMN     "emailFoundAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LinkedInCompanyJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "companySlug" TEXT,
    "companyName" TEXT,
    "location" TEXT,
    "posted" TEXT,
    "workplace" TEXT,
    "employment" TEXT,
    "applicants" INTEGER,
    "salary" TEXT,
    "tags" TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedInCompanyJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectSearchCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "paramsHash" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectSearchCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkedInCompanyJob_userId_companySlug_idx" ON "LinkedInCompanyJob"("userId", "companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInCompanyJob_userId_jobId_key" ON "LinkedInCompanyJob"("userId", "jobId");

-- CreateIndex
CREATE INDEX "CollectSearchCache_createdAt_idx" ON "CollectSearchCache"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectSearchCache_userId_operation_paramsHash_key" ON "CollectSearchCache"("userId", "operation", "paramsHash");

-- AddForeignKey
ALTER TABLE "LinkedInCompanyJob" ADD CONSTRAINT "LinkedInCompanyJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectSearchCache" ADD CONSTRAINT "CollectSearchCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
