-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authentikId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_authentikId_key" ON "User"("authentikId");
