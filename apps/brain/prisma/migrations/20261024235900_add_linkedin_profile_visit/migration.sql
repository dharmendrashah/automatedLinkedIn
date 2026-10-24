-- CreateEnum
CREATE TYPE "ProfileVisitStatus" AS ENUM ('ASKED', 'DONE', 'NOT_AVAILABLE', 'FAILED');

-- CreateTable
CREATE TABLE "LinkedInProfileVisit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "profileId" TEXT,
    "slug" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "ProfileVisitStatus" NOT NULL DEFAULT 'ASKED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "LinkedInProfileVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInProfileVisit_sessionId_key" ON "LinkedInProfileVisit"("sessionId");

-- CreateIndex
CREATE INDEX "LinkedInProfileVisit_accountId_createdAt_idx" ON "LinkedInProfileVisit"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LinkedInProfileVisit_accountId_slug_idx" ON "LinkedInProfileVisit"("accountId", "slug");

-- CreateIndex
CREATE INDEX "LinkedInProfileVisit_profileId_idx" ON "LinkedInProfileVisit"("profileId");

-- AddForeignKey
ALTER TABLE "LinkedInProfileVisit" ADD CONSTRAINT "LinkedInProfileVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInProfileVisit" ADD CONSTRAINT "LinkedInProfileVisit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInProfileVisit" ADD CONSTRAINT "LinkedInProfileVisit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LinkedInProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
