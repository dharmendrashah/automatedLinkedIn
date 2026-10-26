-- CreateEnum
CREATE TYPE "PostVisibility" AS ENUM ('ANYONE', 'CONNECTIONS');

-- AlterTable
ALTER TABLE "PostDraft" ADD COLUMN     "audience" "PostVisibility" NOT NULL DEFAULT 'ANYONE',
ADD COLUMN     "comments" "PostVisibility" NOT NULL DEFAULT 'ANYONE';

-- AlterTable
ALTER TABLE "PostPublication" ADD COLUMN     "audience" "PostVisibility" NOT NULL DEFAULT 'ANYONE',
ADD COLUMN     "comments" "PostVisibility" NOT NULL DEFAULT 'ANYONE';
