-- CreateEnum
CREATE TYPE "LinkedInPostStatus" AS ENUM ('UNPROCESSED', 'PROCESSED');

-- CreateTable
CREATE TABLE "LinkedInPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "LinkedInPostStatus" NOT NULL DEFAULT 'UNPROCESSED',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkedInPost_userId_archivedAt_createdAt_idx" ON "LinkedInPost"("userId", "archivedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInPost_userId_slug_key" ON "LinkedInPost"("userId", "slug");

-- AddForeignKey
ALTER TABLE "LinkedInPost" ADD CONSTRAINT "LinkedInPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
