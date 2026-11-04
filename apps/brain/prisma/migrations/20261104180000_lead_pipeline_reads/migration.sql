-- Account reads (.plan/lead-pipeline-p9-new-reads.md): what an account notifications, profile viewers, feed and mutual connections showed. Additive; no data changes.

-- CreateTable
CREATE TABLE "AccountNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slug" TEXT,
    "at" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileViewer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slug" TEXT,
    "company" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "at" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileViewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "authorSlug" TEXT,
    "hash" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutualRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "mutual" TEXT[],
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutualRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountNotification_userId_at_idx" ON "AccountNotification"("userId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "AccountNotification_accountId_key_key" ON "AccountNotification"("accountId", "key");

-- CreateIndex
CREATE INDEX "ProfileViewer_userId_at_idx" ON "ProfileViewer"("userId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileViewer_accountId_key_key" ON "ProfileViewer"("accountId", "key");

-- CreateIndex
CREATE INDEX "FeedPost_userId_at_idx" ON "FeedPost"("userId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPost_accountId_hash_key" ON "FeedPost"("accountId", "hash");

-- CreateIndex
CREATE INDEX "MutualRead_userId_readAt_idx" ON "MutualRead"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "MutualRead_accountId_slug_key" ON "MutualRead"("accountId", "slug");

-- AddForeignKey
ALTER TABLE "AccountNotification" ADD CONSTRAINT "AccountNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileViewer" ADD CONSTRAINT "ProfileViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutualRead" ADD CONSTRAINT "MutualRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

