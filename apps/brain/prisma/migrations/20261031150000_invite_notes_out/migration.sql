-- An account that used its free invite notes this month (.plan/invite-note-fallback.md): until then its invites go without the note.
ALTER TABLE "LinkedInAccount" ADD COLUMN "notesOutUntil" TIMESTAMP(3);
