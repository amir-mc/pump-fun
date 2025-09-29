/*
  Warnings:

  - You are about to drop the column `realSolRes` on the `Token` table. All the data in the column will be lost.
  - You are about to drop the column `realTokenRes` on the `Token` table. All the data in the column will be lost.
  - You are about to drop the column `virtualSolRes` on the `Token` table. All the data in the column will be lost.
  - You are about to drop the column `virtualTokenRes` on the `Token` table. All the data in the column will be lost.
  - Added the required column `Tokenprice` to the `Token` table without a default value. This is not possible if the table is not empty.
  - Added the required column `executable` to the `Token` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rentEpoch` to the `Token` table without a default value. This is not possible if the table is not empty.
  - Added the required column `space` to the `Token` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Token" DROP COLUMN "realSolRes",
DROP COLUMN "realTokenRes",
DROP COLUMN "virtualSolRes",
DROP COLUMN "virtualTokenRes",
ADD COLUMN     "Tokenprice" BIGINT NOT NULL,
ADD COLUMN     "executable" BIGINT NOT NULL,
ADD COLUMN     "rentEpoch" BIGINT NOT NULL,
ADD COLUMN     "space" BIGINT NOT NULL;
