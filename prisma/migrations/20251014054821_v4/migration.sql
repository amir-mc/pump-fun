-- CreateTable
CREATE TABLE "public"."BondingCurveSignatureTest" (
    "id" SERIAL NOT NULL,
    "signature" TEXT NOT NULL,
    "curveAddress" TEXT NOT NULL,
    "slot" BIGINT NOT NULL,
    "blockTime" INTEGER,
    "confirmationStatus" TEXT NOT NULL,
    "error" TEXT,
    "memo" TEXT,
    "virtualTokenReserves" BIGINT NOT NULL,
    "virtualSolReserves" BIGINT NOT NULL,
    "realTokenReserves" BIGINT NOT NULL,
    "realSolReserves" BIGINT NOT NULL,
    "tokenTotalSupply" BIGINT NOT NULL,
    "complete" BOOLEAN NOT NULL,
    "creator" TEXT,
    "preTokenAmount" BIGINT,
    "postTokenAmount" BIGINT,
    "tokenDiff" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BondingCurveSignatureTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BondingCurveSignatureTest_signature_key" ON "public"."BondingCurveSignatureTest"("signature");
