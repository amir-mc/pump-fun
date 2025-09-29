/*
  Warnings:

  - You are about to alter the column `Tokenprice` on the `BondingCurveTest` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.

*/
-- AlterTable
ALTER TABLE "public"."BondingCurveTest" ALTER COLUMN "Tokenprice" SET DATA TYPE DECIMAL(65,30);
