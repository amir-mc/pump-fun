// getath-corrected.ts
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
  athSOL: number;
  athUSD: number;
  athTimestamp: Date;
  currentSOL: number;
  currentUSD: number;
  currentTimestamp: Date;
  percentageFromATH: number;
}

async function calculateATHForAllCurves(): Promise<ATHRecord[]> {
  await updateSolPrice();

  const allCurves = await prisma.bondingCurveSignatureTest.findMany({
    select: { curveAddress: true },
    distinct: ['curveAddress']
  });

  console.log(`🎯 Found ${allCurves.length} curve addresses`);

  const athResults: ATHRecord[] = [];

  for (const curve of allCurves) {
    const curveAddress = curve.curveAddress;
    
    const allRecords = await prisma.bondingCurveSignatureTest.findMany({
      where: { curveAddress },
      orderBy: { createdAt: 'asc' }
    });

    if (allRecords.length === 0) continue;

    console.log(`\n📊 Analyzing ${curveAddress} with ${allRecords.length} records`);

    // از اولین رکورد به عنوان پایه استفاده می‌کنیم
    const firstRecord = allRecords[0];
    let runningVirtualSol = Number(firstRecord.virtualSolReserves);
    let runningVirtualToken = Number(firstRecord.virtualTokenReserves);
    
    let athSOL = 0;
    let athUSD = 0;
    let athTimestamp = new Date(0);

    // برای هر تراکنش، virtual reserves رو آپدیت می‌کنیم
    for (const record of allRecords) {
      const tokenDiff = Number(record.tokenDiff);
      const totalSupply = Number(record.tokenTotalSupply) / 1e9;

      // تقریب تغییرات در virtual reserves بر اساس tokenDiff
      if (tokenDiff > 0) {
        // خرید: virtualSol افزایش، virtualToken کاهش
        const solIncrease = (tokenDiff / 1e9) * (runningVirtualSol / LAMPORTS_PER_SOL) / (runningVirtualToken / 1e9) * LAMPORTS_PER_SOL;
        runningVirtualSol += solIncrease;
        runningVirtualToken -= tokenDiff;
      } else if (tokenDiff < 0) {
        // فروش: virtualSol کاهش، virtualToken افزایش  
        const solDecrease = (Math.abs(tokenDiff) / 1e9) * (runningVirtualSol / LAMPORTS_PER_SOL) / (runningVirtualToken / 1e9) * LAMPORTS_PER_SOL;
        runningVirtualSol -= solDecrease;
        runningVirtualToken += Math.abs(tokenDiff);
      }

      // محاسبه قیمت فعلی - فرمول اصلاح شده: virtualSol / virtualToken (بدون ضریب 2)
      const currentVirtualSol = runningVirtualSol / LAMPORTS_PER_SOL;
      const currentVirtualToken = runningVirtualToken / 1e9;

      if (currentVirtualToken > 0) {
        const pricePerTokenSOL = currentVirtualSol / currentVirtualToken; // اصلاح شد: بدون ضریب 2
        const marketCapSOL = pricePerTokenSOL * totalSupply;
        const marketCapUSD = marketCapSOL * SOL_TO_USD;

        if (marketCapUSD > athUSD) {
          athSOL = marketCapSOL;
          athUSD = marketCapUSD;
          athTimestamp = record.createdAt;
        }
      }
    }

    // محاسبه قیمت فعلی (آخرین وضعیت) - فرمول اصلاح شده
    const finalVirtualSol = runningVirtualSol / LAMPORTS_PER_SOL;
    const finalVirtualToken = runningVirtualToken / 1e9;
    const totalSupply = Number(allRecords[allRecords.length - 1].tokenTotalSupply) / 1e9;

    let currentSOL = 0;
    let currentUSD = 0;

    if (finalVirtualToken > 0) {
      const pricePerTokenSOL = finalVirtualSol / finalVirtualToken; // اصلاح شد: بدون ضریب 2
      currentSOL = pricePerTokenSOL * totalSupply;
      currentUSD = currentSOL * SOL_TO_USD;
    }

    const percentageFromATH = athUSD > 0 ? ((currentUSD - athUSD) / athUSD) * 100 : 0;

    athResults.push({
      curveAddress,
      athSOL,
      athUSD,
      athTimestamp,
      currentSOL,
      currentUSD,
      currentTimestamp: allRecords[allRecords.length - 1].createdAt,
      percentageFromATH
    });

    console.log(`📈 ${curveAddress}`);
    console.log(`   ATH: $${athUSD.toFixed(2)} (${athSOL.toFixed(2)} SOL)`);
    console.log(`   Current: $${currentUSD.toFixed(2)} (${currentSOL.toFixed(2)} SOL)`);
    console.log(`   Change from ATH: ${percentageFromATH.toFixed(2)}%`);
  }

  // مرتب‌سازی بر اساس ATH
  athResults.sort((a, b) => b.athUSD - a.athUSD);

  return athResults;
}

async function main() {
  try {
    console.log("🚀 Calculating ATH (Corrected Formula - No 2x multiplier)...");
    
    const athResults = await calculateATHForAllCurves();
    
    console.log(`\n🎉 ATH Calculation Completed!`);
    console.log(`📊 Total curves analyzed: ${athResults.length}`);
    
    console.log(`\n🏆 TOP 10 BY ATH:`);
    athResults.slice(0, 10).forEach((result, index) => {
      console.log(`${index + 1}. ${result.curveAddress}`);
      console.log(`   ATH: $${result.athUSD.toFixed(2)} (${result.athSOL.toFixed(2)} SOL)`);
      console.log(`   Current: $${result.currentUSD.toFixed(2)} (${result.currentSOL.toFixed(2)} SOL)`);
      console.log(`   Change: ${result.percentageFromATH.toFixed(2)}%`);
      console.log('');
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error in main function:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}