/*
  Warnings:

  - The values [SUSPEPENDED] on the enum `OrganizationStus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OrganizationStus_new" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');
ALTER TABLE "Organization" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Organization" ALTER COLUMN "status" TYPE "OrganizationStus_new" USING ("status"::text::"OrganizationStus_new");
ALTER TYPE "OrganizationStus" RENAME TO "OrganizationStus_old";
ALTER TYPE "OrganizationStus_new" RENAME TO "OrganizationStus";
DROP TYPE "OrganizationStus_old";
ALTER TABLE "Organization" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;
