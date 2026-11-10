-- The score filter and the score sort of My network (.plan/network-score-filter.md).
-- CreateIndex
CREATE INDEX "Person_userId_score_idx" ON "Person"("userId", "score");
