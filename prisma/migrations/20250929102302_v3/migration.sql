/*
  Warnings:

  - You are about to alter the column `Tokenprice` on the `BondingCurveTest` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.

*/
-- AlterTable
ALTER TABLE "public"."BondingCurveTest" ALTER COLUMN "Tokenprice" SET DATA TYPE DOUBLE PRECISION;
