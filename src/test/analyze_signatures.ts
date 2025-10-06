// analyze_signatures.ts
/**
 * Analyze saved bonding curve signatures and calculate price range
 */

import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { PrismaClient } from "../generated/prisma";
import { calculateBondingCurvePrice, getBondingCurveState } from "./get_manual_curve";


const prisma = new PrismaClient();
const endpoint = process.env.SOLANA_NODE_RPC_ENDPOINT || clusterApiUrl("mainnet-beta");
const connection = new Connection(endpoint, "confirmed");

/**
 * Analyze bonding curve signatures and compute min/max token prices
 */
async function analyzeSignatures() {
  console.log("🚀 Starting Signature Analysis...");
  console.log(`🌐 RPC Endpoint: ${endpoint}`);

  try {
    // 1️⃣ گرفتن همه‌ی Signatureهایی که در جدول ذخیره شدن
    const signatures = await prisma.bondingCurveSignature.findMany({
      take: 50,
      orderBy: { blockTime: "desc" }, // جدیدترین‌ها اول
    });

    if (signatures.length === 0) {
      console.log("⚠️ No signatures found in database.");
      return;
    }

    const prices: number[] = [];

    // 2️⃣ پیمایش همه‌ی signatureها
    for (const sig of signatures) {
      try {
        const curveAddress = new PublicKey(sig.curveAddress);
        const curveState = await getBondingCurveState(connection, curveAddress);

        const priceSol = calculateBondingCurvePrice(curveState);
        prices.push(priceSol);

        console.log(
          `🧾 Signature: ${sig.signature} | Slot: ${sig.slot} | Price: ${priceSol.toFixed(10)} SOL`
        );
      } catch (err: any) {
        console.error(`❌ Error analyzing signature ${sig.signature}: ${err.message}`);
      }
    }

    if (prices.length === 0) {
      console.log("⚠️ No valid prices could be calculated.");
      return;
    }

    // 3️⃣ پیدا کردن بیشترین و کمترین قیمت
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    console.log("\n📊 PRICE RANGE ANALYSIS");
    console.log("=========================");
    console.log(`🔻 Lowest Price: ${minPrice.toFixed(10)} SOL`);
    console.log(`🔺 Highest Price: ${maxPrice.toFixed(10)} SOL`);
    console.log(`📈 Price Difference: ${(maxPrice - minPrice).toFixed(10)} SOL`);
  } catch (error: any) {
    console.error("💥 Error analyzing signatures:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeSignatures().catch(console.error);
