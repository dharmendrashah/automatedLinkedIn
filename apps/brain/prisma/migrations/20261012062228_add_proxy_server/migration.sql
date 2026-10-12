-- CreateEnum
CREATE TYPE "ProxyProtocol" AS ENUM ('HTTP', 'HTTPS', 'SOCKS4', 'SOCKS5');

-- CreateEnum
CREATE TYPE "ProxyServerStatus" AS ENUM ('PENDING', 'ACTIVE', 'GEO_MISMATCH', 'UNREACHABLE', 'DISABLED');

-- CreateTable
CREATE TABLE "ProxyServer" (
    "id" TEXT NOT NULL,
    "linkedInAccountId" TEXT NOT NULL,
    "protocol" "ProxyProtocol" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "secret" TEXT NOT NULL,
    "secretIv" TEXT NOT NULL,
    "secretTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "ProxyServerStatus" NOT NULL DEFAULT 'PENDING',
    "statusMessage" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "detectedCountryCode" TEXT,
    "detectedCountry" TEXT,
    "detectedIp" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyServer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProxyServer_linkedInAccountId_idx" ON "ProxyServer"("linkedInAccountId");

-- AddForeignKey
ALTER TABLE "ProxyServer" ADD CONSTRAINT "ProxyServer_linkedInAccountId_fkey" FOREIGN KEY ("linkedInAccountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
