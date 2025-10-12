// gettotalcap.ts

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

interface MarketCapResult {
  signature: string;
  curveAddress: string;
  totalMarketCapSOL: number;
  totalMarketCapUSD: number;
  pricePerTokenSOL: number;
  pricePerTokenUSD: number;
  tokenTotalSupply: bigint;
  tokenSupplyStandard: number;
  timestamp: Date;
  transactionType: string;
  solVolume: number;
  tokenVolume: number;
}

let SOL_TO_USD = 217; 

export async function updateSolPrice(): Promise<number> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();
    SOL_TO_USD = data.solana.usd;
    console.log(`💰 SOL Price Updated: $${SOL_TO_USD}`);
    return SOL_TO_USD;
  } catch (error) {
    console.warn('⚠️ Failed to fetch SOL price, using default:', SOL_TO_USD);
    return SOL_TO_USD;
  }
}

/**
 * محاسبه مارکت کپ برای یک رکورد خاص
 */
function calculateMarketCap(record: any): MarketCapResult {
  const pricePerTokenSOL = record.priceSol ? parseFloat(record.priceSol) : 
                         record.priceLamports ? Number(record.priceLamports) / LAMPORTS_PER_SOL : 0;

  const pricePerTokenUSD = pricePerTokenSOL * SOL_TO_USD;
  const tokenSupplyStandard = Number(record.tokenTotalSupply) / 1e9;
  const totalMarketCapSOL = pricePerTokenSOL * tokenSupplyStandard;
  const totalMarketCapUSD = totalMarketCapSOL * SOL_TO_USD;

  const solChange = Number(record.postBalances) - Number(record.preBalances);
  const solVolume = Math.abs(solChange) / LAMPORTS_PER_SOL;
  const tokenVolume = record.tokenSentOut ? Number(record.tokenSentOut) / 1e9 : 0;
  const transactionType = record.tokenSentOut && record.tokenSentOut > 0 ? 'BUY' : 'SELL';

  return {
    signature: record.signature,
    curveAddress: record.curveAddress,
    totalMarketCapSOL,
    totalMarketCapUSD,
    pricePerTokenSOL,
    pricePerTokenUSD,
    tokenTotalSupply: record.tokenTotalSupply,
    tokenSupplyStandard,
    timestamp: record.createdAt,
    transactionType,
    solVolume,
    tokenVolume,
  };
}

/**
 * گرفتن آخرین مارکت کپ برای تمام curve addresses (بدون تکراری)
 */
export async function getAllUniqueCurveMarketCaps(): Promise<MarketCapResult[]> {
  try {
    // آپدیت قیمت SOL
    await updateSolPrice();

    // گرفتن آخرین رکورد هر curve address
    const latestRecords = await prisma.bondingCurveSignature.groupBy({
      by: ['curveAddress'],
      _max: { createdAt: true },
    });

    console.log(`🎯 Found ${latestRecords.length} unique curve addresses`);

    const results: MarketCapResult[] = [];

    for (const record of latestRecords) {
      const latestRecord = await prisma.bondingCurveSignature.findFirst({
        where: { 
          curveAddress: record.curveAddress,
          createdAt: record._max.createdAt!
        },
        select: {
          signature: true,
          curveAddress: true,
          tokenTotalSupply: true,
          priceSol: true,
          priceLamports: true,
          tokenSentOut: true,
          preBalances: true,
          postBalances: true,
          createdAt: true,
          blockTime: true,
        },
      });

      if (!latestRecord) continue;

      const marketCap = calculateMarketCap(latestRecord);
      results.push(marketCap);

      console.log(`📊 ${record.curveAddress}:`);
      console.log(`   Market Cap: $${marketCap.totalMarketCapUSD.toLocaleString()}`);
      console.log(`   Price: $${marketCap.pricePerTokenUSD.toExponential(6)} per token`);
      console.log(`   Supply: ${marketCap.tokenSupplyStandard.toLocaleString()} tokens`);
      console.log(`   Last Transaction: ${marketCap.timestamp.toISOString()}`);
      console.log('   ' + '-'.repeat(50));
    }

    // مرتب‌سازی بر اساس مارکت کپ (نزولی)
    results.sort((a, b) => b.totalMarketCapUSD - a.totalMarketCapUSD);

    console.log(`\n🎯 TOTAL UNIQUE CURVES: ${results.length}`);
    console.log(`💰 Current SOL Price: $${SOL_TO_USD}`);
    console.log('='.repeat(80));

    return results;

  } catch (error) {
    console.error('❌ Error getting all unique curve market caps:', error);
    return [];
  }
}

/**
 * گرفتن آمار کلی
 */
export async function getTotalMarketStats(): Promise<{
  totalMarketCapUSD: number;
  totalMarketCapSOL: number;
  averageMarketCapUSD: number;
  medianMarketCapUSD: number;
  curveCount: number;
}> {
  const allMarketCaps = await getAllUniqueCurveMarketCaps();

  if (allMarketCaps.length === 0) {
    return {
      totalMarketCapUSD: 0,
      totalMarketCapSOL: 0,
      averageMarketCapUSD: 0,
      medianMarketCapUSD: 0,
      curveCount: 0,
    };
  }

  const totalMarketCapUSD = allMarketCaps.reduce((sum, mc) => sum + mc.totalMarketCapUSD, 0);
  const totalMarketCapSOL = allMarketCaps.reduce((sum, mc) => sum + mc.totalMarketCapSOL, 0);
  const averageMarketCapUSD = totalMarketCapUSD / allMarketCaps.length;
  
  const sortedMarketCaps = allMarketCaps.map(mc => mc.totalMarketCapUSD).sort((a, b) => a - b);
  const medianMarketCapUSD = sortedMarketCaps.length % 2 === 0 
    ? (sortedMarketCaps[sortedMarketCaps.length / 2 - 1] + sortedMarketCaps[sortedMarketCaps.length / 2]) / 2
    : sortedMarketCaps[Math.floor(sortedMarketCaps.length / 2)];

  return {
    totalMarketCapUSD,
    totalMarketCapSOL,
    averageMarketCapUSD,
    medianMarketCapUSD,
    curveCount: allMarketCaps.length,
  };
}

/**
 * نمایش گزارش کامل
 */
export async function generateMarketCapReport(): Promise<void> {
  console.log('🚀 GENERATING MARKET CAP REPORT (GROUPED BY CURVE ADDRESS)...\n');

  // گرفتن تمام مارکت کپ‌های یکتا
  const allMarketCaps = await getAllUniqueCurveMarketCaps();
  const stats = await getTotalMarketStats();

  // نمایش خلاصه
  console.log('\n📈 MARKET CAP SUMMARY (BY CURVE ADDRESS)');
  console.log('='.repeat(80));
  console.log(`🏦 Total Unique Curves: ${stats.curveCount}`);
  console.log(`💰 Total Market Cap: $${stats.totalMarketCapUSD.toLocaleString()} (${stats.totalMarketCapSOL.toFixed(4)} SOL)`);
  console.log(`📊 Average Market Cap: $${stats.averageMarketCapUSD.toLocaleString()}`);
  console.log(`⚖️  Median Market Cap: $${stats.medianMarketCapUSD.toLocaleString()}`);
  console.log('='.repeat(80));

  // نمایش هر curve
  console.log('\n🏷️ INDIVIDUAL CURVE ANALYSIS (UNIQUE BY CURVE ADDRESS)');
  console.log('='.repeat(80));
  
  allMarketCaps.forEach((mc, index) => {
    console.log(`\n${index + 1}. ${mc.curveAddress}`);
    console.log(`   Market Cap: $${mc.totalMarketCapUSD.toLocaleString()} (${mc.totalMarketCapSOL.toFixed(4)} SOL)`);
    console.log(`   Price: $${mc.pricePerTokenUSD.toExponential(6)} per token`);
    console.log(`   Supply: ${mc.tokenSupplyStandard.toLocaleString()} tokens`);
    console.log(`   Last Transaction: ${mc.timestamp.toISOString()}`);
    console.log(`   Type: ${mc.transactionType}`);
    console.log(`   Signature: ${mc.signature}`);
  });

  console.log('\n✅ REPORT GENERATION COMPLETE');
}

/**
 * گرفتن تاریخچه یک curve address خاص
 */
export async function getCurveHistory(curveAddress: string): Promise<MarketCapResult[]> {
  try {
    const records = await prisma.bondingCurveSignature.findMany({
      where: { curveAddress },
      orderBy: { createdAt: 'desc' },
      select: {
        signature: true,
        curveAddress: true,
        tokenTotalSupply: true,
        priceSol: true,
        priceLamports: true,
        tokenSentOut: true,
        preBalances: true,
        postBalances: true,
        createdAt: true,
        blockTime: true,
      },
    });

    const results: MarketCapResult[] = records.map(record => calculateMarketCap(record));

    console.log(`\n📊 History for ${curveAddress}: ${results.length} transactions`);
    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.timestamp.toISOString()} - ${result.transactionType}`);
      console.log(`   Market Cap: $${result.totalMarketCapUSD.toLocaleString()}`);
      console.log(`   Price: $${result.pricePerTokenUSD.toExponential(6)}`);
      console.log(`   Volume: ${result.solVolume.toFixed(6)} SOL`);
    });

    return results;

  } catch (error) {
    console.error(`❌ Error getting history for curve ${curveAddress}:`, error);
    return [];
  }
}

// اجرای مستقیم اگر فایل مستقیماً اجرا شود
if (require.main === module) {
  generateMarketCapReport().catch(console.error);
}