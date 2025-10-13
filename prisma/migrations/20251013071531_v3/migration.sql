/*
  Warnings:

  - You are about to drop the column `postBalances` on the `BondingCurveSignature` table. All the data in the column will be lost.
  - You are about to drop the column `preBalances` on the `BondingCurveSignature` table. All the data in the column will be lost.
  - You are about to drop the column `priceLamports` on the `BondingCurveSignature` table. All the data in the column will be lost.
  - You are about to drop the column `priceSol` on the `BondingCurveSignature` table. All the data in the column will be lost.
  - You are about to drop the column `tokenSentOut` on the `BondingCurveSignature` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."BondingCurveSignature" DROP COLUMN "postBalances",
DROP COLUMN "preBalances",
DROP COLUMN "priceLamports",
DROP COLUMN "priceSol",
DROP COLUMN "tokenSentOut",
ADD COLUMN     "postTokenAmount" BIGINT,
ADD COLUMN     "preTokenAmount" BIGINT,
ADD COLUMN     "tokenDiff" BIGINT;
