/*
  Warnings:

  - Changed the type of `virtualTokenReserves` on the `BondingCurveSignature` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `virtualSolReserves` on the `BondingCurveSignature` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `realTokenReserves` on the `BondingCurveSignature` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `realSolReserves` on the `BondingCurveSignature` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `tokenTotalSupply` on the `BondingCurveSignature` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `preBalances` on the `BondingCurveSignature` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `postBalances` on the `BondingCurveSignature` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "public"."BondingCurveSignature" DROP COLUMN "virtualTokenReserves",
ADD COLUMN     "virtualTokenReserves" BIGINT NOT NULL,
DROP COLUMN "virtualSolReserves",
ADD COLUMN     "virtualSolReserves" BIGINT NOT NULL,
DROP COLUMN "realTokenReserves",
ADD COLUMN     "realTokenReserves" BIGINT NOT NULL,
DROP COLUMN "realSolReserves",
ADD COLUMN     "realSolReserves" BIGINT NOT NULL,
DROP COLUMN "tokenTotalSupply",
ADD COLUMN     "tokenTotalSupply" BIGINT NOT NULL,
DROP COLUMN "preBalances",
ADD COLUMN     "preBalances" BIGINT NOT NULL,
DROP COLUMN "postBalances",
ADD COLUMN     "postBalances" BIGINT NOT NULL;
