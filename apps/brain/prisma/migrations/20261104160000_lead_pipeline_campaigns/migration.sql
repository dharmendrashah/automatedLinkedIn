-- Campaigns (.plan/lead-pipeline-p5-campaign-page.md): a group of workflows with the label its people carry, the stage of each workflow,
-- and a daily rollup. Additive; no data changes.

-- CreateEnum
CREATE TYPE "CampaignStage" AS ENUM ('DISCOVER', 'INVITE', 'WARM_UP', 'FIRST_MESSAGE', 'HAND_OFF', 'NO_ANSWER', 'OTHER');

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "stage" "CampaignStage" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icpId" TEXT,
    "voiceId" TEXT,
    "pausedAt" TIMESTAMP(3),
    "pausedWorkflowIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDay" (
    "campaignId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "found" INTEGER NOT NULL DEFAULT 0,
    "qualified" INTEGER NOT NULL DEFAULT 0,
    "invited" INTEGER NOT NULL DEFAULT 0,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "messaged" INTEGER NOT NULL DEFAULT 0,
    "replied" INTEGER NOT NULL DEFAULT 0,
    "handedOver" INTEGER NOT NULL DEFAULT 0,
    "draftsMade" INTEGER NOT NULL DEFAULT 0,
    "draftsApproved" INTEGER NOT NULL DEFAULT 0,
    "draftsRejected" INTEGER NOT NULL DEFAULT 0,
    "draftsExpired" INTEGER NOT NULL DEFAULT 0,
    "aiCostMicros" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignDay_pkey" PRIMARY KEY ("campaignId","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_userId_name_key" ON "Campaign"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_userId_label_key" ON "Campaign"("userId", "label");

-- CreateIndex
CREATE INDEX "Workflow_campaignId_idx" ON "Workflow"("campaignId");

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDay" ADD CONSTRAINT "CampaignDay_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
