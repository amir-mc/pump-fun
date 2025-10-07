/*
  Warnings:

  - Added the required column `postBalances` to the `BondingCurveSignature` table without a default value. This is not possible if the table is not empty.
  - Added the required column `preBalances` to the `BondingCurveSignature` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."BondingCurveSignature" ADD COLUMN     "postBalances" BIGINT NOT NULL,
ADD COLUMN     "preBalances" BIGINT NOT NULL;
