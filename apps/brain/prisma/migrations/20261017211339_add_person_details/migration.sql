-- AlterTable
ALTER TABLE "WorkflowListMember" ADD COLUMN     "company" TEXT,
ADD COLUMN     "followers" INTEGER,
ADD COLUMN     "matched" TEXT[],
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "PersonSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonSnapshot_userId_slug_key" ON "PersonSnapshot"("userId", "slug");

-- AddForeignKey
ALTER TABLE "PersonSnapshot" ADD CONSTRAINT "PersonSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
