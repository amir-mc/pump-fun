/*
  Warnings:

  - Added the required column `Tokenprice` to the `BondingCurveTest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."BondingCurveTest" ADD COLUMN     "Tokenprice" BIGINT NOT NULL;
