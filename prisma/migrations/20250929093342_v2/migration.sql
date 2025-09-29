-- CreateTable
CREATE TABLE "public"."BondingCurveTest" (
    "id" SERIAL NOT NULL,
    "curveAddr" TEXT NOT NULL,
    "virtual_token_reserves" BIGINT NOT NULL,
    "virtual_sol_reserves" BIGINT NOT NULL,
    "real_token_reserves" BIGINT NOT NULL,
    "real_sol_reserves" BIGINT NOT NULL,
    "token_total_supply" BIGINT NOT NULL,
    "complete" BOOLEAN NOT NULL,
    "creator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BondingCurveTest_pkey" PRIMARY KEY ("id")
);
