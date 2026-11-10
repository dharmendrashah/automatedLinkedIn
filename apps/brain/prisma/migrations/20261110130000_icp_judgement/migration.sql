-- The AI's fit judgement of a person for an ideal customer (30-day reuse; deleted with the person, the ideal customer or the owner).
-- CreateTable
CREATE TABLE "IcpJudgement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "icpId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fit" INTEGER NOT NULL,
    "judgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcpJudgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IcpJudgement_judgedAt_idx" ON "IcpJudgement"("judgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IcpJudgement_userId_slug_icpId_key" ON "IcpJudgement"("userId", "slug", "icpId");

-- AddForeignKey
ALTER TABLE "IcpJudgement" ADD CONSTRAINT "IcpJudgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcpJudgement" ADD CONSTRAINT "IcpJudgement_icpId_fkey" FOREIGN KEY ("icpId") REFERENCES "Icp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
