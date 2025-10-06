-- CreateTable
CREATE TABLE "public"."BondingCurveSignature" (
    "id" SERIAL NOT NULL,
    "signature" TEXT NOT NULL,
    "curveAddress" TEXT NOT NULL,
    "slot" BIGINT NOT NULL,
    "blockTime" INTEGER,
    "confirmationStatus" TEXT NOT NULL,
    "error" TEXT,
    "memo" TEXT,
    "virtualTokenReserves" TEXT NOT NULL,
    "virtualSolReserves" TEXT NOT NULL,
    "realTokenReserves" TEXT NOT NULL,
    "realSolReserves" TEXT NOT NULL,
    "tokenTotalSupply" TEXT NOT NULL,
    "complete" BOOLEAN NOT NULL,
    "creator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BondingCurveSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BondingCurveSignature_signature_key" ON "public"."BondingCurveSignature"("signature");

-- CreateIndex
CREATE INDEX "BondingCurveSignature_curveAddress_idx" ON "public"."BondingCurveSignature"("curveAddress");

-- CreateIndex
CREATE INDEX "BondingCurveSignature_slot_idx" ON "public"."BondingCurveSignature"("slot");

-- CreateIndex
CREATE INDEX "BondingCurveSignature_blockTime_idx" ON "public"."BondingCurveSignature"("blockTime");
