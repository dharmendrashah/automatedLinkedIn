-- CreateEnum
CREATE TYPE "WorkflowListMemberState" AS ENUM ('QUALIFIED', 'MAYBE');

-- CreateEnum
CREATE TYPE "WorkflowListMemberStatus" AS ENUM ('NEW', 'IN_REVIEW', 'DONE', 'NOT_A_FIT');

-- CreateTable
CREATE TABLE "WorkflowList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowListMember" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "headline" TEXT,
    "location" TEXT,
    "state" "WorkflowListMemberState" NOT NULL DEFAULT 'QUALIFIED',
    "status" "WorkflowListMemberStatus" NOT NULL DEFAULT 'NEW',
    "postUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowListMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Icp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "includeTitles" TEXT[],
    "excludeTitles" TEXT[],
    "seniorities" TEXT[],
    "industries" TEXT[],
    "companySizes" TEXT[],
    "locations" TEXT[],
    "problemKeywords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Icp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowList_userId_name_key" ON "WorkflowList"("userId", "name");

-- CreateIndex
CREATE INDEX "WorkflowListMember_listId_state_createdAt_idx" ON "WorkflowListMember"("listId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowListMember_slug_idx" ON "WorkflowListMember"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowListMember_listId_slug_key" ON "WorkflowListMember"("listId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_userId_slug_key" ON "Suppression"("userId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Icp_userId_name_key" ON "Icp"("userId", "name");

-- AddForeignKey
ALTER TABLE "WorkflowList" ADD CONSTRAINT "WorkflowList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowListMember" ADD CONSTRAINT "WorkflowListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "WorkflowList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Icp" ADD CONSTRAINT "Icp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
