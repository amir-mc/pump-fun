-- CreateTable
CREATE TABLE "public"."Token" (
    "mintAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "bondingCurve" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "virtualTokenRes" BIGINT NOT NULL,
    "virtualSolRes" BIGINT NOT NULL,
    "realTokenRes" BIGINT NOT NULL,
    "realSolRes" BIGINT NOT NULL,
    "totalSupply" BIGINT NOT NULL,
    "complete" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("mintAddress")
);

-- CreateIndex
CREATE UNIQUE INDEX "Token_mintAddress_key" ON "public"."Token"("mintAddress");
