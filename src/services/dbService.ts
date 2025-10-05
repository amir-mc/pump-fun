// src/services/dbService.ts
import { PrismaClient } from "../generated/prisma";
import { BondingCurveStateProps } from "../curve/get_bonding_curve_status";
import { TokenInfo } from "../types";

const prisma = new PrismaClient();

/**
 * ذخیره اولیه یا به‌روزرسانی پایه‌ای (upsert) — هنگام تشخیص توکن جدید
 */
export async function saveTokenToDB(tokenInfo: TokenInfo) {
  try {
    await prisma.token.upsert({
      where: { mintAddress: tokenInfo.mint },
      update: {
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        bondingCurve: tokenInfo.bondingCurve,
        creator: tokenInfo.creator ?? undefined,
        signature: tokenInfo.signature ?? "",
        timestamp: new Date(tokenInfo.timestamp),
      },
      create: {
        mintAddress: tokenInfo.mint,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        bondingCurve: tokenInfo.bondingCurve,
        creator: tokenInfo.creator ?? "",
        signature: tokenInfo.signature ?? "",
        timestamp: new Date(tokenInfo.timestamp),
        Tokenprice: "0",          // مقدار اولیه
        totalSupply: BigInt(0),   // مقدار اولیه
        complete: false,
        virtualTokenReserves: BigInt(0),    // مقدار اولیه
        virtualSolReserves: BigInt(0),      // مقدار اولیه
        realTokenReserves: BigInt(0),       // مقدار اولیه
        realSolReserves: BigInt(0),         // مقدار اولیه
      },
    });

    console.log(`✅ Token ${tokenInfo.name} upserted (initial save)`);
  } catch (err: any) {
    console.error("❌ Error upserting token:", err);
  }
}

/**
 * آپدیت رکورد توکن بر اساس mintAddress (فاز بعد از خواندن bonding curve)
 * mintAddress باید آدرس mint توکن باشه (نه آدرس bonding curve)
 */
export async function updateTokenInDB(
  mintAddress: string,
  bondingCurveState: BondingCurveStateProps,
  tokenPriceSol?: number
) {
  try {
    const priceStr =
      typeof tokenPriceSol === "number"
        ? tokenPriceSol.toFixed(10)
        : (() => {
            const LAMPORTS_PER_SOL = 1_000_000_000n;
            const TOKEN_DECIMALS = 6n;
            try {
              const sol = Number(bondingCurveState.virtual_sol_reserves) / Number(LAMPORTS_PER_SOL);
              const tokens = Number(bondingCurveState.virtual_token_reserves) / 10 ** Number(TOKEN_DECIMALS);
              return (sol / tokens).toFixed(10);
            } catch {
              return "0";
            }
          })();

    await prisma.token.update({
      where: { mintAddress },
      data: {
        Tokenprice: priceStr,
        totalSupply: bondingCurveState.token_total_supply,
        complete: bondingCurveState.complete,
        creator: bondingCurveState.creator ? bondingCurveState.creator.toBase58() : undefined,
        virtualTokenReserves: bondingCurveState.virtual_token_reserves,
        virtualSolReserves: bondingCurveState.virtual_sol_reserves,
        realTokenReserves: bondingCurveState.real_token_reserves,
        realSolReserves: bondingCurveState.real_sol_reserves,
      },
    });

    console.log(`🔄 Token ${mintAddress} updated with curve data`);
  } catch (err: any) {
    if (err.code === "P2025") {
      console.warn(`⚠️ Token ${mintAddress} not found for update — creating minimal record...`);
      try {
        await prisma.token.create({
          data: {
            mintAddress,
            name: "unknown",
            symbol: "UNK",
            bondingCurve: "",
            creator: bondingCurveState.creator ? bondingCurveState.creator.toBase58() : "",
            signature: "",
            timestamp: new Date(),
            Tokenprice: tokenPriceSol ? tokenPriceSol.toFixed(10) : "0",
            totalSupply: bondingCurveState.token_total_supply,
            complete: bondingCurveState.complete,
            virtualTokenReserves: bondingCurveState.virtual_token_reserves,
            virtualSolReserves: bondingCurveState.virtual_sol_reserves,
            realTokenReserves: bondingCurveState.real_token_reserves,
            realSolReserves: bondingCurveState.real_sol_reserves,
          },
        });
        console.log(`✅ Minimal token ${mintAddress} created as fallback`);
      } catch (createErr: any) {
        console.error("❌ Error creating minimal token on fallback:", createErr);
      }
    } else {
      console.error("❌ Error updating token:", err);
    }
  }
}
