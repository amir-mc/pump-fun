// WebSocket.ts
import WebSocket, { WebSocketServer } from "ws";
import { PrismaClient } from "../generated/prisma";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const prisma = new PrismaClient();
const PORT = Number(process.env.WS_PORT || 8080);
const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 WebSocket Server starting on port ${PORT}`);

let SOL_TO_USD = 172;
let isDatabaseConnected = false;

/** ===========================
 * Database init & Helpers
 * =========================== */
async function initializeDatabase(): Promise<boolean> {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    isDatabaseConnected = true;
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    isDatabaseConnected = false;
    return false;
  }
}

/** ===========================
 * SOL price updater
 * =========================== */
async function updateSolPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    const data = await res.json();
    if (data?.solana?.usd) {
      SOL_TO_USD = data.solana.usd;
      console.log(`💰 SOL Price Updated: $${SOL_TO_USD}`);
    }
  } catch (e) {
    console.log("⚠️ Using cached/default SOL price:", SOL_TO_USD);
  }
  return SOL_TO_USD;
}

/** ===========================
 * Core Calculation Functions (Based on your provided logic)
 * =========================== */

/**
 * محاسبه قیمت بر اساس فرمول بهبود یافته (مشابه فایل getath-with-correct-initial-price.ts)
 */
function calculateTokenPrice(
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint,
  totalSupply: bigint
): { pricePerTokenSOL: number; marketCapSOL: number } {
  if (virtualSolReserves <= 0n || virtualTokenReserves <= 0n) {
    return { pricePerTokenSOL: 0, marketCapSOL: 0 };
  }

  const virtualSol = Number(virtualSolReserves) / Number(LAMPORTS_PER_SOL);
  const virtualTokens = Number(virtualTokenReserves) / 1e9;
  const totalSupplyTokens = Number(totalSupply) / 1e9;

  if (virtualTokens <= 0 || totalSupplyTokens <= 0) {
    return { pricePerTokenSOL: 0, marketCapSOL: 0 };
  }

  // فرمول اصلی: قیمت = virtualSol / virtualTokens
  const pricePerTokenSOL = virtualSol / virtualTokens;
  
  // مارکت‌کپ = قیمت × عرضه کل
  const marketCapSOL = pricePerTokenSOL * totalSupplyTokens;

  return { pricePerTokenSOL, marketCapSOL };
}
/**
 * تبدیل زمان به فرمت خوانا
 */
function formatTimeDifference(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ${diffHours % 24} hour${diffHours % 24 > 1 ? 's' : ''}`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ${diffMinutes % 60} minute${diffMinutes % 60 > 1 ? 's' : ''}`;
  } else {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
  }
}

/** ===========================
 * Data Getters (Based on your corrected logic)
 * =========================== */

/**
 * برگرداندن لیست curveها
 */
async function getAvailableCurves(): Promise<
  { curveAddress: string; tokenName: string; tokenSymbol: string }[]
> {
  try {
    const curves = await prisma.bondingCurveSignature.findMany({
      select: { curveAddress: true },
      distinct: ["curveAddress"],
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const result = await Promise.all(
      curves.map(async (c) => {
        const token = await prisma.token.findFirst({
          where: { bondingCurve: c.curveAddress },
        });
        return {
          curveAddress: c.curveAddress,
          tokenName: token?.name || "Unknown",
          tokenSymbol: token?.symbol || "UNK",
        };
      })
    );

    return result;
  } catch (error) {
    console.error("❌ Error fetching available curves:", error);
    return [];
  }
}

/**
 * محاسبه ATH برای یک curve (بر اساس منطق getath-with-correct-initial-price.ts)
 */
async function calculateATHForCurve(curveAddress: string): Promise<any> {
  const allRecords = await prisma.bondingCurveSignature.findMany({
    where: { curveAddress },
    orderBy: { createdAt: 'asc' }
  });

  if (allRecords.length === 0) {
    throw new Error("No records for curve");
  }

  console.log(`📊 Analyzing ${curveAddress} with ${allRecords.length} records`);

  // اولین رکورد (عرضه اولیه)
  const firstRecord = allRecords[0];
  
  // محاسبه قیمت زمان عرضه با فرمول بهبود یافته
  const { pricePerTokenSOL: initialPriceSOL, marketCapSOL: initialMarketCapSOL } = 
    calculateTokenPrice(
      firstRecord.virtualSolReserves,
      firstRecord.virtualTokenReserves,
      firstRecord.tokenTotalSupply
    );
  
  const initialPriceUSD = initialPriceSOL * SOL_TO_USD;
  const initialTimestamp = firstRecord.createdAt;

  console.log(`🎯 Initial Price Calculation:`);
  console.log(`   virtualSolReserves: ${firstRecord.virtualSolReserves}`);
  console.log(`   virtualTokenReserves: ${firstRecord.virtualTokenReserves}`);
  console.log(`   tokenTotalSupply: ${firstRecord.tokenTotalSupply}`);
  console.log(`   Calculated Price: ${initialPriceSOL.toFixed(8)} SOL ($${initialPriceUSD.toFixed(6)} USD)`);

  let runningVirtualSol = Number(firstRecord.virtualSolReserves);
  let runningVirtualToken = Number(firstRecord.virtualTokenReserves);
  
  let athSOL = initialMarketCapSOL;
  let athUSD = initialMarketCapSOL * SOL_TO_USD;
  let athTimestamp = initialTimestamp;

  // برای هر تراکنش، virtual reserves رو آپدیت می‌کنیم
  for (const record of allRecords) {
    const tokenDiff = Number(record.tokenDiff);

    // تقریب تغییرات در virtual reserves بر اساس tokenDiff
    if (tokenDiff > 0) {
      // خرید: virtualSol افزایش، virtualToken کاهش
      const currentPriceSOL = calculateTokenPrice(
        BigInt(Math.round(runningVirtualSol)),
        BigInt(Math.round(runningVirtualToken)),
        record.tokenTotalSupply
      ).pricePerTokenSOL;
      
      const solIncrease = (tokenDiff / 1e9) * currentPriceSOL * LAMPORTS_PER_SOL;
      runningVirtualSol += solIncrease;
      runningVirtualToken -= tokenDiff;
    } else if (tokenDiff < 0) {
      // فروش: virtualSol کاهش، virtualToken افزایش  
      const currentPriceSOL = calculateTokenPrice(
        BigInt(Math.round(runningVirtualSol)),
        BigInt(Math.round(runningVirtualToken)),
        record.tokenTotalSupply
      ).pricePerTokenSOL;
      
      const solDecrease = (Math.abs(tokenDiff) / 1e9) * currentPriceSOL * LAMPORTS_PER_SOL;
      runningVirtualSol -= solDecrease;
      runningVirtualToken += Math.abs(tokenDiff);
    }

    // محاسبه مارکت‌کپ فعلی
    const { marketCapSOL: currentMarketCapSOL } = calculateTokenPrice(
      BigInt(Math.round(runningVirtualSol)),
      BigInt(Math.round(runningVirtualToken)),
      record.tokenTotalSupply
    );
    
    const currentMarketCapUSD = currentMarketCapSOL * SOL_TO_USD;

    if (currentMarketCapUSD > athUSD) {
      athSOL = currentMarketCapSOL;
      athUSD = currentMarketCapUSD;
      athTimestamp = record.createdAt;
    }
  }

  // محاسبه قیمت فعلی (آخرین وضعیت)
  const lastRecord = allRecords[allRecords.length - 1];
  const { marketCapSOL: currentMarketCapSOL, pricePerTokenSOL: currentPriceSOL } = calculateTokenPrice(
    BigInt(Math.round(runningVirtualSol)),
    BigInt(Math.round(runningVirtualToken)),
    lastRecord.tokenTotalSupply
  );
  
  const currentMarketCapUSD = currentMarketCapSOL * SOL_TO_USD;
  const currentPriceUSD = currentPriceSOL * SOL_TO_USD;

  // محاسبه زمان رسیدن به ATH
  const timeToATHMinutes = (athTimestamp.getTime() - initialTimestamp.getTime()) / (1000 * 60);
  const timeToATH = formatTimeDifference(initialTimestamp, athTimestamp);

  const percentageFromATH = athUSD > 0 ? ((currentMarketCapUSD - athUSD) / athUSD) * 100 : 0;
  const percentageFromInitial = initialMarketCapSOL > 0 ? 
    ((currentMarketCapSOL - initialMarketCapSOL) / initialMarketCapSOL) * 100 : 0;

  // پیدا کردن نام و نماد توکن
  const token = await prisma.token.findFirst({
    where: { bondingCurve: curveAddress }
  });

  const result = {
    tokenName: token?.name || "Unknown",
    tokenSymbol: token?.symbol || "UNK",
    initialPriceSOL,
    initialPriceUSD,
    initialTimestamp: initialTimestamp.toISOString(),
    athSOL,
    athUSD,
    athTimestamp: athTimestamp.toISOString(),
    timeToATH,
    timeToATHMinutes,
    currentSOL: currentMarketCapSOL,
    currentUSD: currentMarketCapUSD,
    currentPriceSOL,
    currentPriceUSD,
    currentTimestamp: lastRecord.createdAt.toISOString(),
    percentageFromATH,
    percentageFromInitial
  };

  console.log(`📈 ATH Analysis for ${token?.name || "Unknown"} (${token?.symbol || "UNK"}):`);
  console.log(`   Initial Price: $${initialPriceUSD.toFixed(4)} (${initialPriceSOL.toFixed(6)} SOL)`);
  console.log(`   ATH MarketCap: $${athUSD.toFixed(2)} (${athSOL.toFixed(2)} SOL)`);
  console.log(`   Current MarketCap: $${currentMarketCapUSD.toFixed(2)} (${currentMarketCapSOL.toFixed(2)} SOL)`);
  console.log(`   Current Price: $${currentPriceUSD.toFixed(4)} (${currentPriceSOL.toFixed(6)} SOL)`);
  console.log(`   Time to ATH: ${timeToATH}`);
  console.log(`   Change from ATH: ${percentageFromATH.toFixed(2)}%`);
  console.log(`   Change from Initial: ${percentageFromInitial.toFixed(2)}%`);

  return result;
}

/**
 * ساخت تاریخچه قیمت برای یک curve
 */
async function getPriceHistory(curveAddress: string, limit = 200) {
  try {
    const allRecords = await prisma.bondingCurveSignature.findMany({
      where: { curveAddress },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    if (allRecords.length === 0) return [];

    const history: any[] = [];
    let runningVirtualSol = Number(allRecords[0].virtualSolReserves);
    let runningVirtualToken = Number(allRecords[0].virtualTokenReserves);

    for (const record of allRecords) {
      const tokenDiff = Number(record.tokenDiff);

      // محاسبه قیمت قبل از اعمال تغییرات
      const { pricePerTokenSOL: priceBefore } = calculateTokenPrice(
        BigInt(Math.round(runningVirtualSol)),
        BigInt(Math.round(runningVirtualToken)),
        record.tokenTotalSupply
      );

      // اعمال تغییرات tokenDiff
      if (tokenDiff > 0) {
        const solIncrease = (tokenDiff / 1e9) * priceBefore * LAMPORTS_PER_SOL;
        runningVirtualSol += solIncrease;
        runningVirtualToken -= tokenDiff;
      } else if (tokenDiff < 0) {
        const solDecrease = (Math.abs(tokenDiff) / 1e9) * priceBefore * LAMPORTS_PER_SOL;
        runningVirtualSol -= solDecrease;
        runningVirtualToken += Math.abs(tokenDiff);
      }

      // محاسبه قیمت بعد از اعمال تغییرات
      const { pricePerTokenSOL: priceAfter, marketCapSOL: marketCapAfter } = calculateTokenPrice(
        BigInt(Math.round(runningVirtualSol)),
        BigInt(Math.round(runningVirtualToken)),
        record.tokenTotalSupply
      );

      history.push({
        x: record.createdAt.getTime(),
        priceSOL: priceAfter,
        priceUSD: priceAfter * SOL_TO_USD,
        marketCapSOL: marketCapAfter,
        marketCapUSD: marketCapAfter * SOL_TO_USD,
        virtualSolReserves: runningVirtualSol,
        virtualTokenReserves: runningVirtualToken,
        tokenTotalSupply: Number(record.tokenTotalSupply),
        tokenDiff,
        timestamp: record.createdAt.toISOString()
      });
    }

    return history;
  } catch (error) {
    console.error("❌ Error building price history:", error);
    return [];
  }
}
async function getLaunchPriceData(curveAddress: string) {
  const firstRecord = await prisma.bondingCurveSignature.findFirst({
    where: { curveAddress },
    orderBy: { createdAt: 'asc' }
  });

  if (!firstRecord) {
    return {
      launchPriceSOL: 0,
      launchPriceUSD: 0,
      launchMarketCapSOL: 0,
      launchMarketCapUSD: 0,
      launchTimestamp: new Date().toISOString()
    };
  }

  // محاسبه قیمت لانچ با استفاده از اولین رکورد
  const { pricePerTokenSOL: launchPriceSOL, marketCapSOL: launchMarketCapSOL } = 
    calculateTokenPrice(
      firstRecord.virtualSolReserves,
      firstRecord.virtualTokenReserves,
      firstRecord.tokenTotalSupply
    );

  const launchPriceUSD = launchPriceSOL * SOL_TO_USD;
  const launchMarketCapUSD = launchMarketCapSOL * SOL_TO_USD;

  console.log(`🚀 Launch Price for ${curveAddress}:`);
  console.log(`   Price: ${launchPriceSOL.toFixed(8)} SOL ($${launchPriceUSD.toFixed(6)} USD)`);
  console.log(`   MarketCap: ${launchMarketCapSOL.toFixed(2)} SOL ($${launchMarketCapUSD.toFixed(2)} USD)`);

  return {
    launchPriceSOL,
    launchPriceUSD,
    launchMarketCapSOL,
    launchMarketCapUSD,
    launchTimestamp: firstRecord.createdAt.toISOString()
  };
}
/**
 * داده کامل یک curve
 */
async function getCompleteCurveData(curveAddress: string) {
  if (!isDatabaseConnected) throw new Error("Database is not connected");

  const latestRecord = await prisma.bondingCurveSignature.findFirst({
    where: { curveAddress },
    orderBy: { createdAt: "desc" },
  });

  if (!latestRecord) throw new Error("No data for curve");

  // محاسبه ATH و داده‌های اولیه
  const athData = await calculateATHForCurve(curveAddress);
  const priceHistory = await getPriceHistory(curveAddress, 1000);
  
  // محاسبه قیمت لانچ صحیح
  const launchData = await getLaunchPriceData(curveAddress);

  // محاسبه درصد تغییر از لانچ
  const percentageFromLaunch = launchData.launchPriceSOL > 0 ? 
    ((athData.currentPriceSOL - launchData.launchPriceSOL) / launchData.launchPriceSOL) * 100 : 0;

  // محاسبه قیمت و مارکت‌کپ فعلی از آخرین رکورد
  const { pricePerTokenSOL: currentPriceSOL, marketCapSOL: currentMarketCapSOL } = 
    calculateTokenPrice(
      latestRecord.virtualSolReserves,
      latestRecord.virtualTokenReserves,
      latestRecord.tokenTotalSupply
    );

  const currentPriceUSD = currentPriceSOL * SOL_TO_USD;
  const currentMarketCapUSD = currentMarketCapSOL * SOL_TO_USD;

  const token = await prisma.token.findFirst({
    where: { bondingCurve: curveAddress }
  });

  const result = {
    curveAddress,
    tokenName: athData.tokenName,
    tokenSymbol: athData.tokenSymbol,
    complete: latestRecord.complete ?? false,
    creator: latestRecord.creator ?? null,
    lastUpdated: latestRecord.createdAt.toISOString(),

    // قیمت و مارکت‌کپ فعلی
    currentPriceSOL,
    currentPriceUSD,
    currentMarketCapSOL,
    currentMarketCapUSD,

    // داده‌های لانچ - استفاده از مقادیر محاسبه شده صحیح
    launchPriceSOL: launchData.launchPriceSOL,
    launchPriceUSD: launchData.launchPriceUSD,
    launchTimestamp: launchData.launchTimestamp,
    launchMarketCapUSD: launchData.launchMarketCapUSD,
    launchMarketCapSOL: launchData.launchMarketCapSOL,
    percentageFromLaunch,

    // داده‌های ATH
    athSOL: athData.athSOL,
    athUSD: athData.athUSD,
    athTimestamp: athData.athTimestamp,
    percentageFromATH: athData.percentageFromATH,
    athMarketCapUSD: athData.athUSD,
    athMarketCapSOL: athData.athSOL,

    // داده‌های اولیه
    initialPriceSOL: athData.initialPriceSOL,
    initialPriceUSD: athData.initialPriceUSD,
    initialTimestamp: athData.initialTimestamp,
    percentageFromInitial: athData.percentageFromInitial,
    timeToATH: athData.timeToATH,
    timeToATHMinutes: athData.timeToATHMinutes,

    // تاریخچه و داده‌های دیگر
    priceHistory,
    solPrice: SOL_TO_USD,
    timestamp: new Date().toISOString(),

    // داده‌های curve
    virtualTokens: Number(latestRecord.virtualTokenReserves) / 1e9,
    virtualSol: Number(latestRecord.virtualSolReserves) / LAMPORTS_PER_SOL,
    realTokens: 0,
    realSol: 0,
    totalSupply: Number(latestRecord.tokenTotalSupply) / 1e9
  };

  console.log(`📊 Final Curve Data for ${result.tokenName} (${result.tokenSymbol}):`);
  console.log(`   Launch: ${result.launchPriceSOL.toFixed(8)} SOL ($${result.launchPriceUSD.toFixed(6)})`);
  console.log(`   Current: ${result.currentPriceSOL.toFixed(8)} SOL ($${result.currentPriceUSD.toFixed(6)})`);
  console.log(`   ATH: $${result.athUSD.toFixed(2)}`);
  console.log(`   Change from Launch: ${result.percentageFromLaunch.toFixed(2)}%`);

  return result;
}

/**
 * گرفتن همه curves
 */
async function getAllCurvesData() {
  const available = await getAvailableCurves();
  const out: any[] = [];
  
  for (const c of available) {
    try {
      const d = await getCompleteCurveData(c.curveAddress);
      out.push(d);
    } catch (e: any) {
      console.warn(`⚠️ Skipping ${c.curveAddress}: ${e?.message || e}`);
    }
  }

  // مرتب بر اساس currentMarketCapUSD
  return out.sort((a, b) => (b.currentMarketCapUSD || 0) - (a.currentMarketCapUSD || 0));
}

/**
 * گرفتن Top ATH (بر اساس منطق فایل شما)
 */
async function getTopATH(limit = 10) {
  const available = await getAvailableCurves();
  const out: any[] = [];

  for (const c of available) {
    try {
      const ath = await calculateATHForCurve(c.curveAddress);
      // فیلتر اولیه (ATH معنادار)
      if ((ath.athUSD ?? 0) > 0.01) {
        out.push({
          tokenName: ath.tokenName,
          tokenSymbol: ath.tokenSymbol,
          curveAddress: c.curveAddress,
          athSOL: ath.athSOL,
          athUSD: ath.athUSD,
          athTimestamp: ath.athTimestamp,
          athMarketCapUSD: ath.athUSD,
          athMarketCapSOL: ath.athSOL,
          currentPriceSOL: ath.currentPriceSOL,
          currentPriceUSD: ath.currentPriceUSD,
          currentMarketCapSOL: ath.currentSOL,
          currentMarketCapUSD: ath.currentUSD,
          percentageFromATH: ath.percentageFromATH,
          percentageFromInitial: ath.percentageFromInitial,
          timeToATH: ath.timeToATH,
          timeToATHMinutes: ath.timeToATHMinutes,
          lastUpdated: ath.currentTimestamp
        });
      }
    } catch (e: any) {
      console.warn(`⚠️ Skipping ${c.curveAddress} in topATH:`, e?.message || e);
    }
  }

  return out.sort((a, b) => (b.athMarketCapUSD || 0) - (a.athMarketCapUSD || 0)).slice(0, limit);
}

/**
 * تحلیل جامع (بر اساس منطق comprehensive-analysis.ts)
 */
async function generateComprehensiveAnalysis() {
  const available = await getAvailableCurves();
  const analysisData: any[] = [];

  let totalInitialMarketCap = 0;
  let totalATHMarketCap = 0;
  let totalCurrentMarketCap = 0;

  for (const c of available) {
    try {
      const ath = await calculateATHForCurve(c.curveAddress);
      
      analysisData.push({
        tokenName: ath.tokenName,
        tokenSymbol: ath.tokenSymbol,
        curveAddress: c.curveAddress,
        initialPriceUSD: ath.initialPriceUSD,
        initialMarketCapUSD: ath.initialPriceUSD * 1000, // تقریب برای تحلیل
        athPriceUSD: ath.athUSD,
        athMarketCapUSD: ath.athUSD,
        currentPriceUSD: ath.currentPriceUSD,
        currentMarketCapUSD: ath.currentUSD,
        gainToATH: ath.percentageFromInitial, // از initial تا ATH
        gainToCurrent: ath.percentageFromInitial, // از initial تا current
        changeFromATH: ath.percentageFromATH,
        timeToATHMinutes: ath.timeToATHMinutes,
        timeToATH: ath.timeToATH
      });

      totalInitialMarketCap += ath.initialPriceUSD * 1000 || 0;
      totalATHMarketCap += ath.athUSD || 0;
      totalCurrentMarketCap += ath.currentUSD || 0;
    } catch (e: any) {
      console.warn("⚠️ Skipping curve in analysis:", e?.message || e);
    }
  }

  // محاسبات آماری
  const gainsToCurrent = analysisData.map(i => i.gainToCurrent).filter(v => !isNaN(v));
  const averageGainToCurrent = gainsToCurrent.length ? 
    gainsToCurrent.reduce((s, v) => s + v, 0) / gainsToCurrent.length : 0;
  
  const medianGainToCurrent = gainsToCurrent.length ? 
    gainsToCurrent.sort((a, b) => a - b)[Math.floor(gainsToCurrent.length / 2)] : 0;

  // توزیع عملکرد
  const performers = {
    gainersFromInitial: analysisData.filter(item => item.gainToCurrent > 0).length,
    losersFromInitial: analysisData.filter(item => item.gainToCurrent < 0).length,
    neutralFromInitial: analysisData.filter(item => item.gainToCurrent >= -1 && item.gainToCurrent <= 1).length,
  };

  // دسته‌بندی عملکرد
  const performanceCategories = {
    megaGainers: analysisData.filter(item => item.gainToCurrent >= 1000).length,
    highGainers: analysisData.filter(item => item.gainToCurrent >= 100 && item.gainToCurrent < 1000).length,
    moderateGainers: analysisData.filter(item => item.gainToCurrent >= 10 && item.gainToCurrent < 100).length,
    slightGainers: analysisData.filter(item => item.gainToCurrent >= 1 && item.gainToCurrent < 10).length,
    neutral: analysisData.filter(item => item.gainToCurrent > -1 && item.gainToCurrent < 1).length,
    slightLosers: analysisData.filter(item => item.gainToCurrent <= -1 && item.gainToCurrent > -10).length,
    moderateLosers: analysisData.filter(item => item.gainToCurrent <= -10 && item.gainToCurrent > -50).length,
    bigLosers: analysisData.filter(item => item.gainToCurrent <= -50 && item.gainToCurrent > -90).length,
    totalLosers: analysisData.filter(item => item.gainToCurrent <= -90).length
  };

  // آمار زمانی
  const timesToATH = analysisData.map(item => item.timeToATHMinutes).filter(time => time > 0);
  const averageTimeToATH = timesToATH.length ? timesToATH.reduce((sum, time) => sum + time, 0) / timesToATH.length : 0;
  const fastestTimeToATH = timesToATH.length ? Math.min(...timesToATH) : 0;
  const slowestTimeToATH = timesToATH.length ? Math.max(...timesToATH) : 0;

  // نمونه‌های برجسته
  const topPerformers = [...analysisData]
    .sort((a, b) => b.gainToCurrent - a.gainToCurrent)
    .slice(0, 5);
  
  const worstPerformers = [...analysisData]
    .sort((a, b) => a.gainToCurrent - b.gainToCurrent)
    .slice(0, 5);
  
  const fastestRisers = [...analysisData]
    .filter(item => item.timeToATHMinutes > 0)
    .sort((a, b) => a.timeToATHMinutes - b.timeToATHMinutes)
    .slice(0, 5);

  const totalValueChange = totalCurrentMarketCap - totalInitialMarketCap;

  return {
    totalTokens: analysisData.length,
    analysisPeriod: `Analysis of ${analysisData.length} tokens`,
    averageGainToCurrent,
    medianGainToCurrent,
    performers,
    performanceCategories,
    averageTimeToATH,
    fastestTimeToATH,
    slowestTimeToATH,
    topPerformers,
    worstPerformers,
    fastestRisers,
    totalInitialMarketCap,
    totalATHMarketCap,
    totalCurrentMarketCap,
    totalValueChange,
    rawData: analysisData
  };
}

/** ===========================
 * WebSocket server handlers
 * =========================== */
wss.on("listening", () => {
  console.log(`🚀 WebSocket Server running on ws://localhost:${PORT}`);
});

wss.on("connection", (ws) => {
  console.log("✅ New client connected");

  // وضعیت اولیه
  ws.send(
    JSON.stringify({
      type: "CONNECTION_STATUS",
      databaseConnected: isDatabaseConnected,
      solPrice: SOL_TO_USD,
    })
  );

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      const type = data.type;

      console.log(`📨 Received message: ${type}`);

      if (type === "GET_AVAILABLE_CURVES") {
        const available = await getAvailableCurves();
        ws.send(JSON.stringify({ type: "AVAILABLE_CURVES", data: available, count: available.length }));
        console.log(`✅ Sent AVAILABLE_CURVES (${available.length})`);
      } else if (type === "GET_CURVE_DATA") {
        const curveAddress = data.curveAddress;
        if (!curveAddress) {
          ws.send(JSON.stringify({ type: "ERROR", message: "curveAddress is required" }));
          return;
        }
        if (!isDatabaseConnected) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Database not available" }));
          return;
        }
        try {
          const curveData = await getCompleteCurveData(curveAddress);
          ws.send(JSON.stringify({ type: "CURVE_DATA", data: curveData }));
          console.log(`✅ Sent CURVE_DATA for ${curveAddress}`);
        } catch (e: any) {
          console.error("❌ Error sending CURVE_DATA:", e?.message || e);
          const available = await getAvailableCurves();
          ws.send(JSON.stringify({ type: "ERROR", message: e?.message || "Failed", availableCurves: available }));
        }
      } else if (type === "GET_ALL_CURVES") {
        if (!isDatabaseConnected) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Database not available" }));
          return;
        }
        try {
          const all = await getAllCurvesData();
          ws.send(JSON.stringify({ type: "ALL_CURVES_DATA", data: all, count: all.length, timestamp: new Date().toISOString() }));
          console.log(`✅ Sent ALL_CURVES_DATA (${all.length})`);
        } catch (e: any) {
          console.error("❌ Error GET_ALL_CURVES:", e);
          ws.send(JSON.stringify({ type: "ERROR", message: `Failed to get all curves: ${e?.message || e}` }));
        }
      } else if (type === "GET_TOP_ATH") {
        if (!isDatabaseConnected) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Database not available" }));
          return;
        }
        const limit = Number(data.limit || 10);
        try {
          const top = await getTopATH(limit);
          ws.send(JSON.stringify({ type: "TOP_ATH_DATA", data: top, count: top.length, timestamp: new Date().toISOString() }));
          console.log(`✅ Sent TOP_ATH_DATA (${top.length})`);
        } catch (e: any) {
          console.error("❌ Error GET_TOP_ATH:", e);
          ws.send(JSON.stringify({ type: "ERROR", message: `Failed to get top ATH: ${e?.message || e}` }));
        }
      } else if (type === "GET_COMPREHENSIVE_ANALYSIS") {
        if (!isDatabaseConnected) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Database not available" }));
          return;
        }
        try {
          const analysis = await generateComprehensiveAnalysis();
          ws.send(JSON.stringify({ type: "COMPREHENSIVE_ANALYSIS", data: analysis, timestamp: new Date().toISOString() }));
          console.log("✅ Sent COMPREHENSIVE_ANALYSIS");
        } catch (e: any) {
          console.error("❌ Error GET_COMPREHENSIVE_ANALYSIS:", e);
          ws.send(JSON.stringify({ type: "ERROR", message: `Failed to generate analysis: ${e?.message || e}` }));
        }
      } else {
        ws.send(JSON.stringify({ type: "ERROR", message: "Unknown message type" }));
      }
    } catch (err: any) {
      console.error("❌ WebSocket message handler error:", err);
      ws.send(JSON.stringify({ type: "ERROR", message: err?.message || "Invalid message" }));
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket client error:", err);
  });
});

/** ===========================
 * Startup tasks
 * =========================== */
initializeDatabase()
  .then((ok) => {
    if (ok) {
      console.log("✅ Server ready");
      updateSolPrice(); // initial fetch
      // update periodically every 5 minutes
      setInterval(updateSolPrice, 5 * 60 * 1000);
    } else {
      console.warn("❌ Server started but DB unavailable");
    }
  })
  .catch((e) => {
    console.error("❌ DB init error:", e);
  });

/** Graceful shutdown */
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down WebSocket server...");
  try {
    await prisma.$disconnect();
  } catch (e) {}
  wss.close(() => {
    console.log("✅ WebSocket server closed");
    process.exit(0);
  });
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

export { wss };