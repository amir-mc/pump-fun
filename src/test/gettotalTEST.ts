// gettotalTEST.ts
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

async function calculateAccurateMarketCap() {
  // گرفتن آخرین رکورد برای curve address مورد نظر
  const curveAddress = "Gj2hc86Bz1hoGKmrQtGqf9TebTkWnTk4bzk7rHJ5J3Vf";
  
  const latestRecord = await prisma.bondingCurveSignatureTest.findFirst({
    where: { curveAddress },
    orderBy: { createdAt: 'desc' }
  });

  if (!latestRecord) {
    console.log("❌ No records found");
    return;
  }

  // نمایش داده‌های خام
  console.log("📊 RAW DATA FROM DATABASE:");
  console.log("=" .repeat(50));
  console.log(`Real SOL Reserves: ${latestRecord.realSolReserves} lamports`);
  console.log(`Real Token Reserves: ${latestRecord.realTokenReserves} units`);
  console.log(`Virtual SOL Reserves: ${latestRecord.virtualSolReserves} lamports`);
  console.log(`Virtual Token Reserves: ${latestRecord.virtualTokenReserves} units`);
  console.log(`Token Total Supply: ${latestRecord.tokenTotalSupply} units`);
  console.log(`Complete: ${latestRecord.complete}`);

  // محاسبات اصلی
  const realSol = Number(latestRecord.realSolReserves) / LAMPORTS_PER_SOL;
  const realTokens = Number(latestRecord.realTokenReserves) / 1e9;
  const virtualSol = Number(latestRecord.virtualSolReserves) / LAMPORTS_PER_SOL;
  const virtualTokens = Number(latestRecord.virtualTokenReserves) / 1e9;
  const totalSupply = Number(latestRecord.tokenTotalSupply) / 1e9;

  console.log("\n🧮 CALCULATED VALUES:");
  console.log("=" .repeat(50));
  console.log(`Real SOL: ${realSol} SOL`);
  console.log(`Real Tokens: ${realTokens} tokens`);
  console.log(`Virtual SOL: ${virtualSol} SOL`);
  console.log(`Virtual Tokens: ${virtualTokens} tokens`);
  console.log(`Total Supply: ${totalSupply} tokens`);

  // قیمت از virtual reserves
  const pricePerTokenSOL = virtualTokens > 0 ? virtualSol / virtualTokens : 0;
  
  // مارکت کپ واقعی
  const marketCapSOL = pricePerTokenSOL * totalSupply;

  // قیمت SOL به USD (تقریبی)
  const SOL_PRICE = 172;
  const pricePerTokenUSD = pricePerTokenSOL * SOL_PRICE;
  const marketCapUSD = marketCapSOL * SOL_PRICE;

  console.log("\n💎 MARKET CAP CALCULATION:");
  console.log("=" .repeat(50));
  console.log(`Price per Token: ${pricePerTokenSOL} SOL`);
  console.log(`Price per Token: $${pricePerTokenUSD}`);
  console.log(`Market Cap: ${marketCapSOL} SOL`);
  console.log(`Market Cap: $${marketCapUSD}`);

  // بررسی خریدها
  const allRecords = await prisma.bondingCurveSignatureTest.findMany({
    where: { curveAddress }
  });

  const buyTransactions = allRecords.filter(record => 
    record.tokenDiff && record.tokenDiff > 0n
  );

  console.log(`\n🛒 FOUND ${buyTransactions.length} BUY TRANSACTIONS`);

  await prisma.$disconnect();
}

// اجرا
calculateAccurateMarketCap().catch(console.error);