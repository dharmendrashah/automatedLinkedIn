-- AlterTable
ALTER TABLE "ProxyScore" ADD COLUMN     "detail" JSONB;

-- AlterTable
ALTER TABLE "ProxyServer" ADD COLUMN     "abuseDetail" JSONB;
