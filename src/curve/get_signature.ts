// get_signature.ts
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma";
import { BondingCurveStateProps } from "./get_bonding_curve_status";

dotenv.config();

const RPC_ENDPOINT = process.env.SOLANA_NODE_RPC_ENDPOINT_SIG || "https://api.mainnet-beta.solana.com";
const prisma = new PrismaClient();
const TOKEN_DECIMALS = 9;

// استفاده از آدرس واقعی Pump program - مطمئن شوید این آدرس درست است
const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const EXPECTED_DISCRIMINATOR = Buffer.alloc(8);
EXPECTED_DISCRIMINATOR.writeBigUInt64LE(6966180631402821399n, 0);

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
 * Fetch bonding curve account state - مشابه کد دوم
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
    console.log("✅ Account Info Found - Data Length:", accInfo.data.length);
    return new BondingCurveState(accInfo.data);
  } catch (error: any) {
    console.error(`❌ Error fetching bonding curve state: ${error.message}`);
    throw new Error("Error accessing bonding curve");
  }
}

/**
 * Calculate price from bonding curve state - برای نمایش بهتر
 */
function calculateBondingCurvePrice(curveState: BondingCurveState): number {
  const LAMPORTS_PER_SOL = 1_000_000_000n;
  
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
 * Display bonding curve state in readable format - برای دیباگ بهتر
 */
function displayBondingCurveState(curveState: BondingCurveState, tokenPriceSol: number): void {
  const LAMPORTS_PER_SOL = 1_000_000_000n;
  
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
 * تابع اصلی برای دریافت و ذخیره signatureها - کاملاً مشابه کد دوم
 */
export async function getAndSaveSignaturesForCurve(
  curveAddress: string,
  curveState: BondingCurveStateProps
): Promise<void> {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const curvePubKey = new PublicKey(curveAddress);

  try {
    console.log(`🔍 Starting signature collection for curve: ${curveAddress}`);
    
    // ابتدا وضعیت فعلی bonding curve را بررسی کنید
    const currentCurveState = await getBondingCurveState(connection, curvePubKey);
    const tokenPriceSol = calculateBondingCurvePrice(currentCurveState);
    
    // نمایش اطلاعات برای دیباگ
    displayBondingCurveState(currentCurveState, tokenPriceSol);

    // گرفتن signatureها - می‌توانید limit را افزایش دهید
    const signatures = await connection.getSignaturesForAddress(curvePubKey, { 
      limit: 100 // افزایش limit برای گرفتن تراکنش‌های بیشتر
    });
    
    console.log(`📝 Found ${signatures.length} signatures for curve ${curveAddress}`);

    // بررسی signatureهای قبلاً ذخیره شده
    const existingSignatures = await prisma.bondingCurveSignature.findMany({
      where: { curveAddress },
      select: { signature: true }
    });
    
    const existingSigSet = new Set(existingSignatures.map(s => s.signature));
    const newSignatures = signatures.filter(sig => !existingSigSet.has(sig.signature));
    
    console.log(`🆕 New signatures to process: ${newSignatures.length}`);

    let processedCount = 0;
    let skippedCount = 0;

    for (const sig of newSignatures) {
      try {
        if (sig.err) {
          console.log(`⚠️ Skipping errored tx: ${sig.signature}`);
          skippedCount++;
          continue;
        }

        const tx = await connection.getTransaction(sig.signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });

        if (!tx?.meta || !tx.transaction) {
          skippedCount++;
          continue;
        }

        // پردازش تراکنش (کد قبلی شما)
        const preTokenBalances = tx.meta?.preTokenBalances ?? [];
        const postTokenBalances = tx.meta?.postTokenBalances ?? [];

        const pre = preTokenBalances.find(b => b.owner === curveAddress);
        const post = postTokenBalances.find(b => b.owner === curveAddress);
        
        if (!pre || !post) {
          skippedCount++;
          continue;
        }

        const preAmount = BigInt(pre.uiTokenAmount.amount);
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const diff = postAmount - preAmount;

        if (diff === 1n || diff === 0n) {
          skippedCount++;
          continue;
        }

        // ذخیره در پایگاه داده
        await prisma.bondingCurveSignature.upsert({
          where: { signature: sig.signature },
          update: {
            blockTime: sig.blockTime,
            confirmationStatus: sig.confirmationStatus || "finalized",
            preTokenAmount: preAmount,
            postTokenAmount: postAmount,
            tokenDiff: diff,
            virtualTokenReserves: curveState.virtual_token_reserves,
            virtualSolReserves: curveState.virtual_sol_reserves,
            realTokenReserves: curveState.real_token_reserves,
            realSolReserves: curveState.real_sol_reserves,
            tokenTotalSupply: curveState.token_total_supply,
            complete: curveState.complete,
            creator: curveState.creator?.toBase58() || null,
          },
          create: {
            signature: sig.signature,
            curveAddress,
            slot: sig.slot,
            blockTime: sig.blockTime,
            confirmationStatus: sig.confirmationStatus || "finalized",
            preTokenAmount: preAmount,
            postTokenAmount: postAmount,
            tokenDiff: diff,
            virtualTokenReserves: curveState.virtual_token_reserves,
            virtualSolReserves: curveState.virtual_sol_reserves,
            realTokenReserves: curveState.real_token_reserves,
            realSolReserves: curveState.real_sol_reserves,
            tokenTotalSupply: curveState.token_total_supply,
            complete: curveState.complete,
            creator: curveState.creator?.toBase58() || null,
          },
        });

        console.log(`💾 Saved NEW Signature: ${sig.signature} → Δ ${diff}`);
        processedCount++;

      } catch (txErr) {
        console.error(`⚠️ Error processing tx ${sig.signature}:`, txErr);
        skippedCount++;
      }
    }

    console.log(`✅ Signature processing completed for curve ${curveAddress}`);
    console.log(`📊 Results: ${processedCount} new processed, ${skippedCount} skipped, ${signatures.length} total found`);

  } catch (error: any) {
    console.error(`❌ Error fetching/saving signatures: ${error.message}`);
  }
}

/**
 * تابع کمکی برای تست مستقیم این ماژول
 */
export async function testGetAndSaveSignatures(curveAddressString: string): Promise<void> {
  try {
    const endpoint = process.env.SOLANA_NODE_RPC_ENDPOINT || clusterApiUrl("mainnet-beta");
    const connection = new Connection(endpoint, "confirmed");
    
    console.log(`🔍 Testing getAndSaveSignaturesForCurve with: ${curveAddressString}`);

    const curveAddress = new PublicKey(curveAddressString);
    const bondingCurveState = await getBondingCurveState(connection, curveAddress);

    // تبدیل به BondingCurveStateProps برای استفاده در تابع اصلی
    const curveStateProps: BondingCurveStateProps = {
      virtual_token_reserves: bondingCurveState.virtual_token_reserves,
      virtual_sol_reserves: bondingCurveState.virtual_sol_reserves,
      real_token_reserves: bondingCurveState.real_token_reserves,
      real_sol_reserves: bondingCurveState.real_sol_reserves,
      token_total_supply: bondingCurveState.token_total_supply,
      complete: bondingCurveState.complete,
      creator: bondingCurveState.creator
    };

    await getAndSaveSignaturesForCurve(curveAddressString, curveStateProps);

  } catch (error: any) {
    console.error(`💥 Error in test: ${error.message}`);
  }
}

// برای تست مستقیم این فایل
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("🚀 Usage: npx ts-node get_signature.ts <bonding_curve_address>");
    console.log("📝 Example: npx ts-node get_signature.ts 8BXEpDP45PMim2bzf7VfXymvzJavPCyEkjWaU7ZF3Jgb");
    process.exit(1);
  }

  const curveAddress = args[0];
  testGetAndSaveSignatures(curveAddress).catch(console.error);
}