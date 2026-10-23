-- The owner dismissed a reply that did not go, so the page stops showing it after a reload.
ALTER TABLE "LinkedInReply" ADD COLUMN "dismissedAt" TIMESTAMP(3);
