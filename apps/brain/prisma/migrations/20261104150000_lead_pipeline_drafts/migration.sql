-- Words and approval (.plan/lead-pipeline-p4-ai-drafts.md): the drafts inbox, the writing voice and the run started by an approval.
-- Additive; no data changes.

-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('COMMENT', 'MESSAGE', 'REPLY');

-- CreateEnum
CREATE TYPE "DraftState" AS ENUM ('DRAFTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "WorkflowTrigger" ADD VALUE 'APPROVAL';

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "DraftKind" NOT NULL,
    "mode" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "item" JSONB,
    "card" JSONB,
    "words" TEXT,
    "originalWords" TEXT,
    "maxChars" INTEGER NOT NULL,
    "state" "DraftState" NOT NULL DEFAULT 'DRAFTED',
    "reason" TEXT,
    "rejectReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "draftedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "originWorkflowId" TEXT NOT NULL,
    "originRunId" TEXT NOT NULL,
    "originNodeId" TEXT NOT NULL,
    "voiceId" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "startedRunId" TEXT,
    "startedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingVoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "about" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "language" TEXT NOT NULL DEFAULT '',
    "avoid" TEXT[],
    "rules" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WritingVoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Draft_userId_state_draftedAt_idx" ON "Draft"("userId", "state", "draftedAt");

-- CreateIndex
CREATE INDEX "Draft_state_expiresAt_idx" ON "Draft"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "Draft_state_startedRunId_decidedAt_idx" ON "Draft"("state", "startedRunId", "decidedAt");

-- CreateIndex
CREATE INDEX "Draft_userId_kind_slug_idx" ON "Draft"("userId", "kind", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "WritingVoice_userId_name_key" ON "WritingVoice"("userId", "name");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingVoice" ADD CONSTRAINT "WritingVoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One draft waits for a target at a time, so two runs never put the same post in the inbox twice.
CREATE UNIQUE INDEX "Draft_waiting_target_key" ON "Draft"("userId", "kind", "targetKey") WHERE "state" = 'DRAFTED';
