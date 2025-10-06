/**
 * Module for checking the status of a token's bonding curve on Solana using Pump.fun program
 * With database storage for signatures
 */
// get_bonding_curve_status.ts
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma";


const LAMPORTS_PER_SOL = 1_000_000_000n;
const TOKEN_DECIMALS = 6n;

dotenv.config();

const RPC_ENDPOINT = process.env.SOLANA_NODE_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";
const prisma = new PrismaClient();

// استفاده از آدرس واقعی Pump program
const PUMP_PROGRAM_ID = new PublicKey("3YwsW2kjLjbrMyj36Lo6GvdwzHkYeN7cNax8Deyypump");
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
export async function getBondingCurveState(
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
    console.log("✅ Account Info Found - Data Length:", accInfo.data.length);
    return new BondingCurveState(accInfo.data);
  } catch (error: any) {
    console.error(`❌ Error fetching bonding curve state: ${error.message}`);
    throw new Error("Error accessing bonding curve");
  }
}

/**
 * Get recent signatures for an address and save to database
 */
async function getAndSaveSignatures(conn: Connection, curveAddress: PublicKey, curveState: BondingCurveState) {
  try {
    // دریافت 50 signature اول
    const signatures = await conn.getSignaturesForAddress(curveAddress, { limit: 50 });
    console.log(`📝 Found ${signatures.length} signatures for bonding curve`);
    
    // ذخیره در دیتابیس
    for (const sig of signatures) {
      try {
        await prisma.bondingCurveSignature.upsert({
          where: { signature: sig.signature },
          update: {
            slot: sig.slot,
            blockTime: sig.blockTime,
            confirmationStatus: sig.confirmationStatus || 'finalized',
            error: sig.err ? JSON.stringify(sig.err) : null,
            memo: sig.memo || null,
          },
          create: {
            signature: sig.signature,
            curveAddress: curveAddress.toBase58(),
            slot: sig.slot,
            blockTime: sig.blockTime,
            confirmationStatus: sig.confirmationStatus || 'finalized',
            error: sig.err ? JSON.stringify(sig.err) : null,
            memo: sig.memo || null,
            virtualTokenReserves: curveState.virtual_token_reserves.toString(),
            virtualSolReserves: curveState.virtual_sol_reserves.toString(),
            realTokenReserves: curveState.real_token_reserves.toString(),
            realSolReserves: curveState.real_sol_reserves.toString(),
            tokenTotalSupply: curveState.token_total_supply.toString(),
            complete: curveState.complete,
            creator: curveState.creator?.toBase58(),
          }
        });
      } catch (dbError) {
        console.error(`❌ Error saving signature ${sig.signature}:`, dbError);
      }
    }
    
    console.log(`💾 Saved ${signatures.length} signatures to database`);
    return signatures;
  } catch (error: any) {
    console.error(`❌ Error fetching/saving signatures: ${error.message}`);
    return [];
  }
}

/**
 * Calculate price from bonding curve state
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

/**
 * Display bonding curve state in readable format
 */
function displayBondingCurveState(curveState: BondingCurveState, tokenPriceSol: number): void {
  console.log("\n🎯 BONDING CURVE STATE ANALYSIS");
  console.log("=================================");
  
  console.log(`💰 Token Price: ${tokenPriceSol.toFixed(10)} SOL`);
  console.log(`💰 Token Price: ${(tokenPriceSol * 172).toFixed(6)} USD`);
  
  console.log("\n📊 Reserve Details:");
  console.log(`   Virtual Token Reserves: ${curveState.virtual_token_reserves.toString()} units`);
  console.log(`   Virtual SOL Reserves: ${curveState.virtual_sol_reserves.toString()} lamports`);
  console.log(`   Real Token Reserves: ${curveState.real_token_reserves.toString()} units`);
  console.log(`   Real SOL Reserves: ${curveState.real_sol_reserves.toString()} lamports`);
  
  console.log("\n📈 Supply Info:");
  console.log(`   Total Token Supply: ${curveState.token_total_supply.toString()} units`);
  console.log(`   Bonding Curve Complete: ${curveState.complete ? '✅ Yes' : '❌ No'}`);
  
  if (curveState.creator) {
    console.log(`   Creator: ${curveState.creator.toBase58()}`);
  }
  
  // نمایش مقادیر به صورت خوانا
  const virtualSol = Number(curveState.virtual_sol_reserves) / Number(LAMPORTS_PER_SOL);
  const virtualTokens = Number(curveState.virtual_token_reserves) / 10 ** Number(TOKEN_DECIMALS);
  const realSol = Number(curveState.real_sol_reserves) / Number(LAMPORTS_PER_SOL);
  const realTokens = Number(curveState.real_token_reserves) / 10 ** Number(TOKEN_DECIMALS);
  const totalSupply = Number(curveState.token_total_supply) / 10 ** Number(TOKEN_DECIMALS);
  
  console.log("\n🔢 Human Readable Values:");
  console.log(`   Virtual SOL: ${virtualSol.toFixed(6)} SOL`);
  console.log(`   Virtual Tokens: ${virtualTokens.toFixed(2)} tokens`);
  console.log(`   Real SOL: ${realSol.toFixed(6)} SOL`);
  console.log(`   Real Tokens: ${realTokens.toFixed(2)} tokens`);
  console.log(`   Total Supply: ${totalSupply.toFixed(2)} tokens`);
}

/**
 * Main test function with manual bonding curve address
 */
async function testBondingCurve() {
  try {
    const endpoint = process.env.SOLANA_NODE_RPC_ENDPOINT || clusterApiUrl("mainnet-beta");
    const connection = new Connection(endpoint, "confirmed");

    // آدرس bonding curve برای تست
    const TEST_BONDING_CURVE_ADDRESS = "A4mfqtbZQgbRrad9WtJQeRqkBZG3gVjiUApag9ysWByJ";
    
    console.log(`🔍 Testing bonding curve address: ${TEST_BONDING_CURVE_ADDRESS}`);
    console.log(`🌐 RPC Endpoint: ${endpoint}`);

    const curveAddress = new PublicKey(TEST_BONDING_CURVE_ADDRESS);
    const bondingCurveState = await getBondingCurveState(connection, curveAddress);

    const tokenPriceSol = calculateBondingCurvePrice(bondingCurveState);
    
    // نمایش کامل اطلاعات
    displayBondingCurveState(bondingCurveState, tokenPriceSol);

    // دریافت و ذخیره signatures
    await getAndSaveSignatures(connection, curveAddress, bondingCurveState);

  } catch (error: any) {
    console.error(`💥 Error in test: ${error.message}`);
    
    if (error.message.includes("Invalid public key")) {
      console.log("❌ Invalid bonding curve address format");
    } else if (error.message.includes("Account does not exist") || error.message.includes("No account info")) {
      console.log("❌ Bonding curve account not found - may be invalid address");
    } else if (error.message.includes("Invalid curve state discriminator")) {
      console.log("❌ This account is not a valid Pump.fun bonding curve");
    }
  } finally {
    await prisma.$disconnect();
  }
}

// اجرای تست
testBondingCurve().catch(console.error);