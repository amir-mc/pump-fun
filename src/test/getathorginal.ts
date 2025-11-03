// getath-with-correct-initial-price.ts
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

let SOL_TO_USD = 172;

async function updateSolPrice(): Promise<number> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const data = await res.json();
    if (data?.solana?.usd) SOL_TO_USD = data.solana.usd;
    return SOL_TO_USD;
  } catch (e) {
    return SOL_TO_USD;
  }
}

interface ATHRecord {
  curveAddress: string;
  tokenName: string;
  tokenSymbol: string;
  
  // قیمت زمان عرضه
  initialPriceSOL: number;
  initialPriceUSD: number;
  initialTimestamp: Date;
  
  // ATH
  athSOL: number;
  athUSD: number;
  athTimestamp: Date;
  
  // زمان رسیدن به ATH
  timeToATH: string;
  timeToATHMinutes: number;
  
  // قیمت فعلی
  currentSOL: number;
  currentUSD: number;
  currentTimestamp: Date;
  
  // درصد تغییرات
  percentageFromATH: number;
  percentageFromInitial: number;
}

/**
 * محاسبه قیمت بر اساس فرمول بهبود یافته
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

async function calculateATHForAllCurves(): Promise<ATHRecord[]> {
  await updateSolPrice();

  const allCurves = await prisma.bondingCurveSignature.findMany({
    select: { curveAddress: true },
    distinct: ['curveAddress']
  });

  console.log(`🎯 Found ${allCurves.length} curve addresses`);

  const athResults: ATHRecord[] = [];

  for (const curve of allCurves) {
    const curveAddress = curve.curveAddress;
    
    const allRecords = await prisma.bondingCurveSignature.findMany({
      where: { curveAddress },
      orderBy: { createdAt: 'asc' }
    });

    if (allRecords.length === 0) continue;

    console.log(`\n📊 Analyzing ${curveAddress} with ${allRecords.length} records`);

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
    const { marketCapSOL: currentMarketCapSOL } = calculateTokenPrice(
      BigInt(Math.round(runningVirtualSol)),
      BigInt(Math.round(runningVirtualToken)),
      lastRecord.tokenTotalSupply
    );
    
    const currentMarketCapUSD = currentMarketCapSOL * SOL_TO_USD;

    // محاسبه قیمت فعلی هر توکن
    const { pricePerTokenSOL: currentPriceSOL } = calculateTokenPrice(
      BigInt(Math.round(runningVirtualSol)),
      BigInt(Math.round(runningVirtualToken)),
      lastRecord.tokenTotalSupply
    );
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

    athResults.push({
      curveAddress,
      tokenName: token?.name || "Unknown",
      tokenSymbol: token?.symbol || "UNK",
      initialPriceSOL,
      initialPriceUSD,
      initialTimestamp,
      athSOL,
      athUSD,
      athTimestamp,
      timeToATH,
      timeToATHMinutes,
      currentSOL: currentMarketCapSOL,
      currentUSD: currentMarketCapUSD,
      currentTimestamp: lastRecord.createdAt,
      percentageFromATH,
      percentageFromInitial
    });

    console.log(`📈 ${token?.name || "Unknown"} (${token?.symbol || "UNK"})`);
    console.log(`   Initial Price: $${initialPriceUSD.toFixed(4)} (${initialPriceSOL.toFixed(6)} SOL)`);
    console.log(`   ATH MarketCap: $${athUSD.toFixed(2)} (${athSOL.toFixed(2)} SOL)`);
    console.log(`   Current MarketCap: $${currentMarketCapUSD.toFixed(2)} (${currentMarketCapSOL.toFixed(2)} SOL)`);
    console.log(`   Current Price: $${currentPriceUSD.toFixed(4)} (${currentPriceSOL.toFixed(6)} SOL)`);
    console.log(`   Time to ATH: ${timeToATH}`);
    console.log(`   Change from ATH: ${percentageFromATH.toFixed(2)}%`);
    console.log(`   Change from Initial: ${percentageFromInitial.toFixed(2)}%`);
  }

  // مرتب‌سازی بر اساس ATH
  athResults.sort((a, b) => b.athUSD - a.athUSD);

  return athResults;
}

async function main() {
  try {
    console.log("🚀 Calculating ATH with Corrected Initial Price...");
    
    const athResults = await calculateATHForAllCurves();
    
    console.log(`\n🎉 ATH Calculation Completed!`);
    console.log(`📊 Total curves analyzed: ${athResults.length}`);
    
    console.log(`\n🏆 TOP 10 BY ATH:`);
    athResults.slice(0, 10).forEach((result, index) => {
      console.log(`${index + 1}. ${result.tokenName} (${result.tokenSymbol})`);
      console.log(`   ATH: $${result.athUSD.toFixed(2)} | Current: $${result.currentUSD.toFixed(2)}`);
      console.log(`   Initial Price: $${result.initialPriceUSD.toFixed(4)}`);
      console.log(`   Time to ATH: ${result.timeToATH}`);
      console.log(`   Change from ATH: ${result.percentageFromATH > 0 ? '🟢' : '🔴'} ${result.percentageFromATH.toFixed(2)}%`);
      console.log(`   Change from Initial: ${result.percentageFromInitial > 0 ? '🟢' : '🔴'} ${result.percentageFromInitial.toFixed(2)}%`);
      console.log('');
    });

    // نمایش سریع‌ترین توکن‌ها برای رسیدن به ATH (با فیلتر قیمت اولیه معقول)
    console.log(`\n⚡ FASTEST TO REACH ATH (Realistic Initial Prices):`);
    const fastestToATH = [...athResults]
      .filter(result => result.initialPriceUSD >= 0.01 && result.initialPriceUSD <= 1.00) // فیلتر قیمت‌های واقعی
      .sort((a, b) => a.timeToATHMinutes - b.timeToATHMinutes)
      .slice(0, 10);
    
    if (fastestToATH.length > 0) {
      fastestToATH.forEach((result, index) => {
        console.log(`${index + 1}. ${result.tokenName} (${result.tokenSymbol})`);
        console.log(`   Time: ${result.timeToATH}`);
        console.log(`   Initial: $${result.initialPriceUSD.toFixed(4)} → ATH: $${result.athUSD.toFixed(2)}`);
        console.log(`   Gain: 🟢 ${result.percentageFromInitial.toFixed(2)}%`);
        console.log('');
      });
    } else {
      console.log("No tokens with realistic initial prices found.");
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error in main function:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}