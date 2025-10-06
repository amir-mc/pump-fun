// src/Token/PriceTracker.ts
import { Connection, clusterApiUrl, PublicKey } from "@solana/web3.js";

// اتصال به شبکه اصلی سولانا
const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

// ساختار ذخیره داده‌های قیمت
interface PriceSample {
  solVirtual: number;
  solReal: number;
  timestamp: string;
}

// متغیرهای ذخیره آمار
const samples: PriceSample[] = [];

/**
 * دریافت و تحلیل اطلاعات حساب توکن در سولانا
 */
export async function trackTokenPrice(tokenMint: string, bondingCurve: string) {
  console.log(`\n🔍 Tracking price for token: ${tokenMint}`);

  const mintKey = new PublicKey(tokenMint);
  const bondingCurveKey = new PublicKey(bondingCurve);

  const accountInfo = await connection.getAccountInfo(bondingCurveKey);
  if (!accountInfo) {
    console.error("❌ Account not found for bonding curve!");
    return;
  }

  const lamports = accountInfo.lamports;
  const solBalance = lamports / 1_000_000_000; // lamports → SOL

  console.log("Account Info:", {
    lamports,
    owner: accountInfo.owner.toBase58(),
  });

  // فرض: Virtual reserves رو همون balance در نظر می‌گیریم (می‌تونی بعداً اصلاحش کنی)
  const solVirtual = solBalance * 0.001; // فرضی برای مثال
  const solReal = solBalance * 0.00000001; // فرضی برای مثال

  const now = new Date().toISOString();
  samples.push({ solVirtual, solReal, timestamp: now });

  const avgVirtual =
    samples.reduce((a, b) => a + b.solVirtual, 0) / samples.length;
  const avgReal = samples.reduce((a, b) => a + b.solReal, 0) / samples.length;

  console.log(`\n📊 Price metrics for: ${tokenMint}`);
  console.log("\n--- SOL BASED ONLY ---");
  console.log(`   Current (virtual): ${solVirtual.toFixed(9)} SOL`);
  console.log(`   Current (real):    ${solReal.toFixed(9)} SOL`);
  console.log(`   AVG (virtual):     ${avgVirtual.toFixed(9)} SOL`);
  console.log(`   AVG (real):        ${avgReal.toFixed(9)} SOL`);
  console.log(`   Samples stored: ${samples.length}`);
}

// اجرای تابع در فواصل مشخص
const token = process.argv[2];
const bondingCurve = process.argv[3];

if (!token || !bondingCurve) {
  console.error("❌ Usage: npx ts-node src/Token/PriceTracker.ts <tokenMint> <bondingCurve>");
  process.exit(1);
}

// هر 10 ثانیه آپدیت قیمت
setInterval(() => {
  trackTokenPrice(token, bondingCurve).catch(console.error);
}, 10_000);
