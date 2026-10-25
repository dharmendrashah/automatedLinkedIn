-- CreateEnum
CREATE TYPE "BrowseMode" AS ENUM ('SAFE', 'MODERATE', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "BrowseClass" AS ENUM ('ACTION', 'BACKGROUND', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BrowseSource" AS ENUM ('ESTIMATED', 'MEASURED', 'NONE');

-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "browseMode" "BrowseMode" NOT NULL DEFAULT 'SAFE',
ADD COLUMN     "clientLabel" TEXT,
ADD COLUMN     "officeDays" INTEGER NOT NULL DEFAULT 31,
ADD COLUMN     "officeEndMinute" INTEGER NOT NULL DEFAULT 1080,
ADD COLUMN     "officeStartMinute" INTEGER NOT NULL DEFAULT 540,
ADD COLUMN     "officeTimeZone" TEXT;

-- CreateTable
CREATE TABLE "BrowseUsage" (
    "sessionId" TEXT NOT NULL,
    "linkedInAccountId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "class" "BrowseClass" NOT NULL,
    "seconds" INTEGER NOT NULL,
    "source" "BrowseSource" NOT NULL DEFAULT 'ESTIMATED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "BrowseUsage_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE INDEX "BrowseUsage_linkedInAccountId_day_idx" ON "BrowseUsage"("linkedInAccountId", "day");

-- AddForeignKey
ALTER TABLE "BrowseUsage" ADD CONSTRAINT "BrowseUsage_linkedInAccountId_fkey" FOREIGN KEY ("linkedInAccountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
