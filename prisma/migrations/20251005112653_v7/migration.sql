/*
  Warnings:

  - Added the required column `realSolReserves` to the `Token` table without a default value. This is not possible if the table is not empty.
  - Added the required column `realTokenReserves` to the `Token` table without a default value. This is not possible if the table is not empty.
  - Added the required column `virtualSolReserves` to the `Token` table without a default value. This is not possible if the table is not empty.
  - Added the required column `virtualTokenReserves` to the `Token` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Token" ADD COLUMN     "realSolReserves" BIGINT NOT NULL,
ADD COLUMN     "realTokenReserves" BIGINT NOT NULL,
ADD COLUMN     "virtualSolReserves" BIGINT NOT NULL,
ADD COLUMN     "virtualTokenReserves" BIGINT NOT NULL;
