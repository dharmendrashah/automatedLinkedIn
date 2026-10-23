-- Files of replies are kept, not deleted: the column says when they were moved to their permanent place.
ALTER TABLE "LinkedInReply" RENAME COLUMN "filesDeletedAt" TO "filesKeptAt";

-- Set when the message LinkedIn showed for the reply was stored and given the reply's own files.
ALTER TABLE "LinkedInReply" ADD COLUMN "matchedAt" TIMESTAMP(3);
