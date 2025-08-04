-- CreateEnum
CREATE TYPE "OrganizationStus" AS ENUM ('ACTIVE', 'SUSPEPENDED', 'PENDING');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "status" "OrganizationStus" NOT NULL DEFAULT 'ACTIVE';
