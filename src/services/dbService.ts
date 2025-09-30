// src/services/dbService.ts
import { BondingCurveStateProps } from "../curve/get_bonding_curve_status";
import { PrismaClient } from "../generated/prisma";
import { TokenInfo } from "../types";

const prisma = new PrismaClient();

// ذخیره اولیه (مرحله اول)
export async function saveTokenToDB(
  tokenInfo: TokenInfo,
  signature: string
) {
  try {
    await prisma.token.create({
      data: {
        mintAddress: tokenInfo.mint,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        bondingCurve: tokenInfo.bondingCurve,
        creator: tokenInfo.creator,
        signature,
        timestamp: new Date(tokenInfo.timestamp),
        Tokenprice: "0",       // مقدار موقت
        totalSupply: BigInt(0), // مقدار موقت
        complete: false,
      },
    });
    console.log(`✅ Token ${tokenInfo.name} ذخیره شد`);
  } catch (err: any) {
    if (err.code === "P2002") {
      console.warn(`⚠️ Token ${tokenInfo.mint} از قبل در DB وجود دارد`);
    } else {
      console.error("❌ Error saving token:", err.message);
    }
  }
}

// آپدیت بعد از 80 ثانیه (مرحله دوم)
export async function updateTokenInDB(
  mintAddress: string,
  bondingCurveState: BondingCurveStateProps
) {
  try {
    await prisma.token.update({
      where: { mintAddress },
      data: {
        Tokenprice: bondingCurveState.virtual_sol_reserves.toString(),
        totalSupply: bondingCurveState.token_total_supply,
        complete: bondingCurveState.complete,
        creator: bondingCurveState.creator?.toBase58(),
      },
    });
    console.log(`🔄 Token ${mintAddress} آپدیت شد`);
  } catch (err: any) {
    console.error("❌ Error updating token:", err.message);
  }
}
