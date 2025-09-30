/**
 * Module for checking the status of a token's bonding curve on Solana using Pump.fun program
 * Converted from Python to TypeScript (Node.js).
 *
 * Pump.fun docs:
 * https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_CREATOR_FEE_README.md
 */

import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { TokenInfo } from "../types";
import { PrismaClient } from "../generated/prisma";
import { saveTokenToDB, updateTokenInDB } from "../services/dbService";


const LAMPORTS_PER_SOL = 1_000_000_000n;
const TOKEN_DECIMALS = 6n;

dotenv.config();

const RPC_ENDPOINT = process.env.SOLANA_NODE_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";

const prisma = new PrismaClient();
// Token mint you want to check
const TOKEN_MINT = "...";

// Constants
const PUMP_PROGRAM_ID = new PublicKey(`${process.env.PUMP_PROGRAM_PUBLIC_KRY}`);
const EXPECTED_DISCRIMINATOR = Buffer.alloc(8);
EXPECTED_DISCRIMINATOR.writeBigUInt64LE(6966180631402821399n, 0);

export interface BondingCurveStateProps {
  virtual_token_reserves: bigint;
  virtual_sol_reserves: bigint;
  real_token_reserves: bigint;
  real_sol_reserves: bigint;
  token_total_supply: bigint;
  complete: boolean;
  creator?: PublicKey;
}

class BondingCurveState {
  virtual_token_reserves: bigint;
  virtual_sol_reserves: bigint;
  real_token_reserves: bigint;
  real_sol_reserves: bigint;
  token_total_supply: bigint;
  complete: boolean;
  creator?: PublicKey;

  constructor(data: Buffer) {
    if (!data.slice(0, 8).equals(EXPECTED_DISCRIMINATOR)) {
      throw new Error("Invalid curve state discriminator");
    }

    // ساختار قدیمی (بدون creator)
    if (data.length < 150) {
      this.virtual_token_reserves = data.readBigUInt64LE(8);
      this.virtual_sol_reserves = data.readBigUInt64LE(16);
      this.real_token_reserves = data.readBigUInt64LE(24);
      this.real_sol_reserves = data.readBigUInt64LE(32);
      this.token_total_supply = data.readBigUInt64LE(40);
      this.complete = data[48] !== 0;
    } else {
      // ساختار جدید (با creator)
      this.virtual_token_reserves = data.readBigUInt64LE(8);
      this.virtual_sol_reserves = data.readBigUInt64LE(16);
      this.real_token_reserves = data.readBigUInt64LE(24);
      this.real_sol_reserves = data.readBigUInt64LE(32);
      this.token_total_supply = data.readBigUInt64LE(40);
      this.complete = data[48] !== 0;
      this.creator = new PublicKey(data.slice(49, 81));
    }
  }
}

/**
 * Derive bonding curve PDA for a mint
 */
async function getAssociatedBondingCurveAddress(
  mint: PublicKey,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    programId
  );
}

/**
 * Fetch bonding curve account state
 */
async function getBondingCurveState(
  conn: Connection,
  curveAddress: PublicKey
): Promise<BondingCurveState> {
  try {
    const accInfo = await conn.getAccountInfo(curveAddress);
    if (!accInfo) {
      throw new Error("No account info returned for bonding curve address");
    }
    if (!accInfo.data || accInfo.data.length === 0) {
      throw new Error("No data returned for bonding curve state");
    }
    console.log("Account Info:", accInfo);  // چاپ اطلاعات حساب برای بررسی
    return new BondingCurveState(accInfo.data);
  } catch (error:any) {
    console.error(`Error fetching bonding curve state: ${error.message}`);
    throw new Error("Error accessing bonding curve");
  }
}

/**
 * Main function: check token bonding curve status
 */
export function calculateBondingCurvePrice(curveState: BondingCurveState): number {
  if (
    curveState.virtual_token_reserves <= 0n ||
    curveState.virtual_sol_reserves <= 0n
  ) {
    throw new Error("Invalid reserve state");
  }

  const sol = Number(curveState.virtual_sol_reserves) / Number(LAMPORTS_PER_SOL);
  const tokens =
    Number(curveState.virtual_token_reserves) / 10 ** Number(TOKEN_DECIMALS);

  return sol / tokens;
}

// تابع main با پارامتر bondingCurveAddress
async function main(bondingCurveAddress: string) {
  try {
    const endpoint =
      process.env.SOLANA_NODE_RPC_ENDPOINT || clusterApiUrl("mainnet-beta");
    const connection = new Connection(endpoint, "confirmed");

    const curveAddress = new PublicKey(bondingCurveAddress);
    const bondingCurveState = await getBondingCurveState(
      connection,
      curveAddress
    );

    const tokenPriceSol = calculateBondingCurvePrice(bondingCurveState);

    console.log("Token price:");
    console.log(`  ${tokenPriceSol.toFixed(10)} SOL`);

    // ✅ به‌جای ذخیره موقت → آپدیت رکورد
    await updateTokenInDB(curveAddress.toBase58(), bondingCurveState);

  } catch (e) {
    console.error("Error:", e);
  }
}


// تابع checkTokenStatus با تاخیر 70 ثانیه‌ای
export async function checkTokenStatus(tokenInfo: TokenInfo): Promise<any> {
  try {
    const mintAddress = tokenInfo.mint;
    
    // اضافه کردن تاخیر 70 ثانیه‌ای
    console.log(`⏳ Waiting 70 seconds before processing token: ${mintAddress}...`);
    await new Promise(resolve => setTimeout(resolve, 70000));
    console.log(`✅ 70 seconds delay completed! Processing token status...`);

    const mint = new PublicKey(mintAddress);

    const [bondingCurveAddress, bump] = await getAssociatedBondingCurveAddress(
      mint,
      PUMP_PROGRAM_ID
    );

    console.log("\nToken status:");
    console.log("-".repeat(50));
    console.log(`Token mint:              ${mint.toBase58()}`);
    console.log(`Associated bonding curve: ${bondingCurveAddress.toBase58()}`);
    console.log(`Bump seed:               ${bump}`);
    console.log("-".repeat(50));

    const conn = new Connection(RPC_ENDPOINT, "confirmed");
    const curveState = await getBondingCurveState(conn, bondingCurveAddress);

    console.log("\nBonding curve status:");
    console.log("-".repeat(50));
    console.log(`Completion status: ${curveState.complete ? "Completed" : "Not completed"}`);
    if (curveState.complete) {
      console.log("\nNote: This bonding curve has completed and liquidity has been migrated to PumpSwap.");
    }
    if (curveState.creator) {
      console.log(`Creator: ${curveState.creator.toBase58()}`);
    }
    console.log("-".repeat(50));

    // ✅ ذخیره توکن در DB
    await saveTokenToDB(tokenInfo, tokenInfo.signature);

    // ارسال bondingCurveAddress به تابع main
    await main(bondingCurveAddress.toBase58());

  } catch (e: any) {
    console.error(`\nError: ${e.message}`);
  }
}


// Run directly from CLI
// if (require.main === module) {
//   const mint = process.argv[2] || TOKEN_MINT;
//   const tokenInfo: TokenInfo = {
//     mint: mint
//     // سایر فیلدها را با مقادیر پیش‌فرض پر کنید
//     // ... بقیه فیلدها
//   };
//   checkTokenStatus(tokenInfo).catch(console.error);
// }

// اگر می‌خواهید تابع main بدون پارامتر هم کار کند
// async function mainWithoutParams() {
//   // استفاده از یک آدرس پیش‌فرض برای تست
//   const defaultCurveAddress = "6YVKPfi6WQ1JVRmCsGjGUj6xeN87Wntakbjttb1qvdu";
//   await main(defaultCurveAddress);
// }

// mainWithoutParams().catch(console.error);