-- CreateTable
CREATE TABLE "public"."Token" (
    "mintAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "bondingCurve" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "Tokenprice" TEXT NOT NULL,
    "totalSupply" BIGINT NOT NULL,
    "complete" BOOLEAN NOT NULL,
    "virtualTokenReserves" BIGINT NOT NULL,
    "virtualSolReserves" BIGINT NOT NULL,
    "realTokenReserves" BIGINT NOT NULL,
    "realSolReserves" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("mintAddress")
);

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
    "preBalances" TEXT NOT NULL,
    "postBalances" TEXT NOT NULL,
    "tokenSentOut" BIGINT,
    "priceLamports" BIGINT,
    "priceSol" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BondingCurveSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Token_mintAddress_key" ON "public"."Token"("mintAddress");

-- CreateIndex
CREATE UNIQUE INDEX "BondingCurveSignature_signature_key" ON "public"."BondingCurveSignature"("signature");

-- CreateIndex
CREATE INDEX "BondingCurveSignature_curveAddress_idx" ON "public"."BondingCurveSignature"("curveAddress");

-- CreateIndex
CREATE INDEX "BondingCurveSignature_slot_idx" ON "public"."BondingCurveSignature"("slot");

-- CreateIndex
CREATE INDEX "BondingCurveSignature_blockTime_idx" ON "public"."BondingCurveSignature"("blockTime");
