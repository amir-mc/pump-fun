// manual_bonding_curve_test.ts
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma";
import { BondingCurveStateProps } from "../curve/get_bonding_curve_status";

dotenv.config();

const RPC_ENDPOINT = process.env.SOLANA_NODE_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";
const prisma = new PrismaClient();
const TOKEN_DECIMALS = 9;

// استفاده از آدرس واقعی Pump program
const PUMP_PROGRAM_ID = new PublicKey("A4mfqtbZQgbRrad9WtJQeRqkBZG3gVjiUApag9ysWByJ");
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
    console.log("✅ Account Info Found - Data Length:", accInfo.data.length);
    return new BondingCurveState(accInfo.data);
  } catch (error: any) {
    console.error(`❌ Error fetching bonding curve state: ${error.message}`);
    throw new Error("Error accessing bonding curve");
  }
}

/**
 * Get and save signatures for curve
 */
async function getAndSaveSignaturesForCurve(
  curveAddress: string,
  curveState: BondingCurveStateProps
): Promise<void> {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const curvePubKey = new PublicKey(curveAddress);

  try {
    const signatures = await connection.getSignaturesForAddress(curvePubKey, { limit: 50 });
    console.log(`📝 Found ${signatures.length} signatures for curve ${curveAddress}`);

    for (const sig of signatures) {
      try {
        if (sig.err) {
          console.log(`⚠️ Skipping errored tx: ${sig.signature}`);
          continue;
        }

        const tx = await connection.getTransaction(sig.signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });

        if (!tx?.meta || !tx.transaction) continue;

        const preTokenBalances = tx.meta?.preTokenBalances ?? [];
        const postTokenBalances = tx.meta?.postTokenBalances ?? [];

        // فیلتر فقط آدرس‌های مرتبط با curveAddress
        const pre = preTokenBalances.find(b => b.owner === curveAddress);
        const post = postTokenBalances.find(b => b.owner === curveAddress);
        if (!pre || !post) continue;

        const preAmount = BigInt(pre.uiTokenAmount.amount);
        const postAmount = BigInt(post.uiTokenAmount.amount);

        // اختلاف مقدار توکن
        const diff = postAmount - preAmount;

        // نادیده گرفتن تراکنش‌های بی‌معنی مثل مقدار 1
        if (diff === 1n || diff === 0n) continue;

        // ذخیره در پایگاه داده
        await prisma.bondingCurveSignatureTest.upsert({
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

        console.log(`💾 Saved Token Change: ${sig.signature} → Δ ${diff}`);
      } catch (txErr) {
        console.error(`⚠️ Error processing tx ${sig.signature}:`, txErr);
      }
    }

    console.log(`✅ All token changes for curve ${curveAddress} processed.`);
  } catch (error: any) {
    console.error(`❌ Error fetching/saving signatures: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Calculate price from bonding curve state
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
 * Display bonding curve state in readable format
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
 * Main function to test specific bonding curve address
 */
export async function testSpecificBondingCurve(curveAddressString: string): Promise<void> {
  try {
    const endpoint = process.env.SOLANA_NODE_RPC_ENDPOINT || clusterApiUrl("mainnet-beta");
    const connection = new Connection(endpoint, "confirmed");
    
    console.log(`🔍 Testing bonding curve address: ${curveAddressString}`);
    console.log(`🌐 RPC Endpoint: ${endpoint}`);

    const curveAddress = new PublicKey(curveAddressString);
    const bondingCurveState = await getBondingCurveState(connection, curveAddress);

    const tokenPriceSol = calculateBondingCurvePrice(bondingCurveState);
    
    // نمایش کامل اطلاعات
    displayBondingCurveState(bondingCurveState, tokenPriceSol);

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

    // دریافت و ذخیره signatures با استفاده از تابع اصلی
    await getAndSaveSignaturesForCurve(curveAddressString, curveStateProps);

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

/**
 * CLI interface for manual testing
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("🚀 Usage: npx ts-node manual_bonding_curve_test.ts <bonding_curve_address>");
    console.log("📝 Example: npx ts-node manual_bonding_curve_test.ts 8BXEpDP45PMim2bzf7VfXymvzJavPCyEkjWaU7ZF3Jgb");
    console.log("📝 Example: npx ts-node manual_bonding_curve_test.ts 7LF2VDUfbScxcKywLeHo43g35CySpWGRR42NU97s4onW");
    process.exit(1);
  }

  const curveAddress = args[0];
  await testSpecificBondingCurve(curveAddress);
}

// اجرای تست اگر فایل مستقیماً اجرا شود
if (require.main === module) {
  main().catch(console.error);
}