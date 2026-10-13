-- CreateEnum
CREATE TYPE "LinkedInProfileStatus" AS ENUM ('NEW', 'CONTACTED', 'REPLIED');

-- CreateTable
CREATE TABLE "LinkedInProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fullName" TEXT,
    "headline" TEXT,
    "company" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "tags" TEXT[],
    "status" "LinkedInProfileStatus" NOT NULL DEFAULT 'NEW',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkedInProfile_userId_archivedAt_createdAt_idx" ON "LinkedInProfile"("userId", "archivedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInProfile_userId_slug_key" ON "LinkedInProfile"("userId", "slug");

-- AddForeignKey
ALTER TABLE "LinkedInProfile" ADD CONSTRAINT "LinkedInProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
