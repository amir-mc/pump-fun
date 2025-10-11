/**
 * Module for checking the status of a token's bonding curve on Solana using Pump.fun program
 * With database storage for signatures
 */
// get_bonding_curve_status.ts
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma";

const LAMPORTS_PER_SOL = 1_000_000_000n;
const TOKEN_DECIMALS = 6n; // اگر توکن دیگری است، این را تغییر بده


dotenv.config();

const RPC_ENDPOINT = process.env.SOLANA_NODE_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";
const prisma = new PrismaClient();

// استفاده از آدرس واقعی Pump program
const PUMP_PROGRAM_ID = new PublicKey("A4mfqtbZQgbRrad9WtJQeRqkBZG3gVjiUApag9ysWByJ");
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
/**
 * Get and save only BUY transactions (from bonding curve → user wallets)
 * - فقط وقتی curve توکن فرستاده (یعنی کاربر خریده)
 * - تراکنش‌هایی با error ذخیره نمی‌شوند
 */
async function getAndSaveSignatures(
  conn: Connection,
  curveAddress: PublicKey,
  curveState: BondingCurveState
) {
  const TOKEN_DECIMALS = 9; // برای بیشتر توکن‌های سولانا
const LAMPORTS_PER_SOL = 1000000000; // 1e9

// یا اگر از @solana/web3.js استفاده می‌کنید:

  try {
    const signatures = await conn.getSignaturesForAddress(curveAddress, { limit: 50 });
    console.log(`📝 Found ${signatures.length} signatures for bonding curve`);

    const curveBase58 = curveAddress.toBase58();

    for (const sig of signatures) {
      try {
        if (sig.err) {
          console.log(`⚠️ Skipping errored transaction: ${sig.signature}`);
          continue;
        }

        const tx = await conn.getTransaction(sig.signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta || !tx.transaction) continue;

        const accountKeys = tx.transaction.message.getAccountKeys().staticAccountKeys.map(
          (key: PublicKey) => key.toBase58()
        );
        
        // پیدا کردن ایندکس bonding curve در لیست حساب‌ها
        const curveIndex = accountKeys.indexOf(curveBase58);
        if (curveIndex === -1) {
          console.log(`❌ Curve address not found in transaction accounts: ${sig.signature}`);
          continue;
        }

        const preBalances = tx.meta.preBalances || [];
        const postBalances = tx.meta.postBalances || [];

        const curvePreBalance = BigInt(preBalances[curveIndex] || 0);
        const curvePostBalance = BigInt(postBalances[curveIndex] || 0);
        const solChange = curvePostBalance - curvePreBalance;
        console.log(`💰 Curve Balance - Pre: ${curvePreBalance}, Post: ${curvePostBalance}, Change: ${solChange}`);

        // بررسی تغییرات توکن (خرید)
        const preTokenBalances = tx.meta.preTokenBalances || [];
        const postTokenBalances = tx.meta.postTokenBalances || [];

        const curveTokenBefore = preTokenBalances.find(b => b.owner === curveBase58);
        const curveTokenAfter = postTokenBalances.find(b => b.owner === curveBase58);

        if (!curveTokenBefore || !curveTokenAfter) {
          console.log(`❌ Token balances not found for curve: ${sig.signature}`);
          continue;
        }

        const beforeAmount = BigInt(curveTokenBefore.uiTokenAmount.amount);
        const afterAmount = BigInt(curveTokenAfter.uiTokenAmount.amount);
        
        // 🔴 اصلاح: محاسبه مقدار واقعی توکن‌های ارسال شده
        const tokenSentOut = beforeAmount - afterAmount;
        
        // اگر توکن از curve خارج شده (خرید اتفاق افتاده)
        if (tokenSentOut <= 0n) {
          console.log(`❌ Not a BUY transaction (tokens not sent out): ${sig.signature}, tokenSentOut: ${tokenSentOut}`);
          continue;
        }

        console.log(`🎯 Token Change - Before: ${beforeAmount}, After: ${afterAmount}, Sent Out: ${tokenSentOut}`);

        // محاسبه قیمت
       const tokenAmountInStandard = Number(tokenSentOut) / Math.pow(10, TOKEN_DECIMALS);
const solAmountInStandard = Number(solChange) / LAMPORTS_PER_SOL;

const priceSol = solAmountInStandard / tokenAmountInStandard;
const priceLamportsPerToken = BigInt(Math.floor(priceSol * LAMPORTS_PER_SOL));

        console.log(`🟢 BUY Detected: ${sig.signature}`);
        console.log(`   SOL Change: ${solChange} lamports`);
        console.log(`   Token Sent Out: ${tokenSentOut}`);
        console.log(`   Price: ${priceSol} SOL per token`);

        await prisma.bondingCurveSignature.upsert({
          where: { signature: sig.signature },
          update: {
            slot: sig.slot,
            blockTime: sig.blockTime,
            confirmationStatus: sig.confirmationStatus || "finalized",
            memo: sig.memo || null,
            preBalances: curvePreBalance,
            postBalances: curvePostBalance,
            tokenSentOut: tokenSentOut,
            priceLamports: priceLamportsPerToken,
            priceSol: priceSol.toString(),
            // اضافه کردن فیلدهای reserves به بخش update
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
            curveAddress: curveBase58,
            slot: sig.slot,
            blockTime: sig.blockTime,
            confirmationStatus: sig.confirmationStatus || "finalized",
            error: null,
            memo: sig.memo || null,
            virtualTokenReserves: curveState.virtual_token_reserves,
            virtualSolReserves: curveState.virtual_sol_reserves,
            realTokenReserves: curveState.real_token_reserves,
            realSolReserves: curveState.real_sol_reserves,
            tokenTotalSupply: curveState.token_total_supply,
            complete: curveState.complete,
            creator: curveState.creator?.toBase58() || null,
            preBalances: curvePreBalance,
            postBalances: curvePostBalance,
            tokenSentOut: tokenSentOut,
            priceLamports: priceLamportsPerToken,
            priceSol: priceSol.toString(),
          },
        });

        console.log(`💾 Saved transaction: ${sig.signature}`);

      } catch (txError) {
        console.error(`⚠️ Error processing transaction ${sig.signature}:`, txError);
      }
    }

    console.log(`💾 Saved BUY transactions successfully`);
  } catch (error: any) {
    console.error(`❌ Error fetching/saving signatures: ${error.message}`);
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