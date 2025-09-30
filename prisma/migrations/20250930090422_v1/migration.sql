/*
  Warnings:

  - You are about to drop the column `executable` on the `Token` table. All the data in the column will be lost.
  - You are about to drop the column `rentEpoch` on the `Token` table. All the data in the column will be lost.
  - You are about to drop the column `space` on the `Token` table. All the data in the column will be lost.
  - You are about to drop the `BondingCurveTest` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Token" DROP COLUMN "executable",
DROP COLUMN "rentEpoch",
DROP COLUMN "space",
ALTER COLUMN "Tokenprice" SET DATA TYPE TEXT;

-- DropTable
DROP TABLE "public"."BondingCurveTest";
