/*
  Warnings:

  - A unique constraint covering the columns `[bondingCurve]` on the table `Token` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."BondingCurveSignature_blockTime_idx";

-- DropIndex
DROP INDEX "public"."BondingCurveSignature_curveAddress_idx";

-- DropIndex
DROP INDEX "public"."BondingCurveSignature_slot_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Token_bondingCurve_key" ON "public"."Token"("bondingCurve");

-- AddForeignKey
ALTER TABLE "public"."BondingCurveSignature" ADD CONSTRAINT "BondingCurveSignature_curveAddress_fkey" FOREIGN KEY ("curveAddress") REFERENCES "public"."Token"("bondingCurve") ON DELETE RESTRICT ON UPDATE CASCADE;
