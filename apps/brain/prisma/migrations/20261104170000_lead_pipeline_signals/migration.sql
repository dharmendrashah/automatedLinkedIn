-- Signals (.plan/lead-pipeline-p7-ranking.md): what a person or a company showed, one row per type, source and day. Additive; no data changes.
-- CreateTable
CREATE TABLE "PersonSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "via" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL,
    "day" DATE NOT NULL,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "via" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonSignal_userId_slug_idx" ON "PersonSignal"("userId", "slug");

-- CreateIndex
CREATE INDEX "PersonSignal_at_idx" ON "PersonSignal"("at");

-- CreateIndex
CREATE UNIQUE INDEX "PersonSignal_userId_slug_type_via_day_key" ON "PersonSignal"("userId", "slug", "type", "via", "day");

-- CreateIndex
CREATE INDEX "CompanySignal_userId_slug_idx" ON "CompanySignal"("userId", "slug");

-- CreateIndex
CREATE INDEX "CompanySignal_at_idx" ON "CompanySignal"("at");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySignal_userId_slug_type_via_day_key" ON "CompanySignal"("userId", "slug", "type", "via", "day");

-- AddForeignKey
ALTER TABLE "PersonSignal" ADD CONSTRAINT "PersonSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySignal" ADD CONSTRAINT "CompanySignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

