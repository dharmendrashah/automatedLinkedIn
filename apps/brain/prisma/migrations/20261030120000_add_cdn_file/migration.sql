-- CreateEnum
CREATE TYPE "CdnFileStatus" AS ENUM ('SAVED', 'PENDING', 'DELETED');

-- CreateTable
CREATE TABLE "CdnFile" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" "CdnFileStatus" NOT NULL DEFAULT 'SAVED',
    "bucketUrl" TEXT,
    "contentType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CdnFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CdnFile_hash_key" ON "CdnFile"("hash");
