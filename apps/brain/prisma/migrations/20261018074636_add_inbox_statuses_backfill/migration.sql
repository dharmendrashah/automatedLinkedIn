-- One status flow: In review is still to do, and Done means they were contacted.
UPDATE "WorkflowListMember" SET "status" = 'NEW' WHERE "status" = 'IN_REVIEW';
UPDATE "WorkflowListMember" SET "status" = 'CONTACTED', "contactedAt" = "updatedAt" WHERE "status" = 'DONE';
