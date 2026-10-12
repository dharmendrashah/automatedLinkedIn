-- AlterEnum
ALTER TYPE "SpiderSessionKind" ADD VALUE 'TASK';

-- AlterTable
ALTER TABLE "SpiderSession" ADD COLUMN     "report" JSONB,
ADD COLUMN     "task" TEXT,
ADD COLUMN     "taskVersion" INTEGER,
ADD COLUMN     "trigger" TEXT,
ADD COLUMN     "verdict" TEXT,
ADD COLUMN     "workerBuild" TEXT;

-- CreateTable
CREATE TABLE "SpiderSessionArtifact" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "step" INTEGER,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpiderSessionArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDefinition" (
    "task" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "manifest" JSONB NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDefinition_pkey" PRIMARY KEY ("task","version")
);

-- CreateIndex
CREATE INDEX "SpiderSessionArtifact_sessionId_idx" ON "SpiderSessionArtifact"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SpiderSessionArtifact_sessionId_path_key" ON "SpiderSessionArtifact"("sessionId", "path");

-- CreateIndex
CREATE INDEX "SpiderSession_task_proxyServerId_startedAt_idx" ON "SpiderSession"("task", "proxyServerId", "startedAt");

-- AddForeignKey
ALTER TABLE "SpiderSessionArtifact" ADD CONSTRAINT "SpiderSessionArtifact_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpiderSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
