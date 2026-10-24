-- CreateEnum
CREATE TYPE "PageVisitKind" AS ENUM ('PROFILE', 'COMPANY');

-- AlterTable
ALTER TABLE "LinkedInProfileVisit" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "kind" "PageVisitKind" NOT NULL DEFAULT 'PROFILE';

-- CreateIndex
CREATE INDEX "LinkedInProfileVisit_companyId_idx" ON "LinkedInProfileVisit"("companyId");

-- AddForeignKey
ALTER TABLE "LinkedInProfileVisit" ADD CONSTRAINT "LinkedInProfileVisit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "LinkedInCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
