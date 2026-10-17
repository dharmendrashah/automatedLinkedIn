-- CreateEnum
CREATE TYPE "PageKind" AS ENUM ('COMPANY', 'POST');

-- AlterTable
ALTER TABLE "SpendLedger" ADD COLUMN     "label" TEXT;

-- CreateTable
CREATE TABLE "PageSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PageKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PageSnapshot_userId_kind_slug_key" ON "PageSnapshot"("userId", "kind", "slug");

-- CreateIndex
CREATE INDEX "WorkflowListMember_postUrl_idx" ON "WorkflowListMember"("postUrl");

-- AddForeignKey
ALTER TABLE "PageSnapshot" ADD CONSTRAINT "PageSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
