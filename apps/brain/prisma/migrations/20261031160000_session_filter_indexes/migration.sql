-- The Sessions page filters by result, action and how a run was started, newest first (.plan/sessions-page.md).
CREATE INDEX "SpiderSession_userId_status_startedAt_idx" ON "SpiderSession"("userId", "status", "startedAt");
CREATE INDEX "SpiderSession_userId_task_startedAt_idx" ON "SpiderSession"("userId", "task", "startedAt");
CREATE INDEX "SpiderSession_userId_trigger_startedAt_idx" ON "SpiderSession"("userId", "trigger", "startedAt");
