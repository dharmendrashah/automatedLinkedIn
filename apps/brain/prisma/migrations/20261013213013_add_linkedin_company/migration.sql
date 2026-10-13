-- CreateEnum
CREATE TYPE "LinkedInCompanyStatus" AS ENUM ('NEW', 'CONTACTED', 'REPLIED');

-- CreateTable
CREATE TABLE "LinkedInCompany" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "size" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "tags" TEXT[],
    "status" "LinkedInCompanyStatus" NOT NULL DEFAULT 'NEW',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkedInCompany_userId_archivedAt_createdAt_idx" ON "LinkedInCompany"("userId", "archivedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInCompany_userId_slug_key" ON "LinkedInCompany"("userId", "slug");

-- AddForeignKey
ALTER TABLE "LinkedInCompany" ADD CONSTRAINT "LinkedInCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
