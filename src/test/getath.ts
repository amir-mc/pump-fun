// getath.ts
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
  currentMarketCapSOL: number;
  currentMarketCapUSD: number;
  percentageFromATH: number;
}

async function calculateATHForAllCurves(): Promise<ATHRecord[]> {
  await updateSolPrice();

  // پیدا کردن تمام curve addressهای منحصر به فرد
  const allCurves = await prisma.bondingCurveSignatureTest.findMany({
    select: { curveAddress: true },
    distinct: ['curveAddress']
  });

  console.log(`🎯 Found ${allCurves.length} curve addresses`);

  const athResults: ATHRecord[] = [];

  for (const curve of allCurves) {
    const curveAddress = curve.curveAddress;
    
    // گرفتن تمام رکوردهای این curve به ترتیب زمانی
    const allRecords = await prisma.bondingCurveSignatureTest.findMany({
      where: { curveAddress },
      orderBy: { createdAt: 'asc' }
    });

    if (allRecords.length === 0) continue;

    let athSOL = 0;
    let athUSD = 0;
    let athTimestamp = new Date(0);

    // محاسبه مارکت کپ برای هر نقطه در زمان
    for (const record of allRecords) {
      const virtualSol = Number(record.virtualSolReserves) / LAMPORTS_PER_SOL;
      const virtualTokens = Number(record.virtualTokenReserves) / 1e9;
      const totalSupply = Number(record.tokenTotalSupply) / 1e9;

      if (virtualTokens > 0) {
        const pricePerTokenSOL = virtualSol / virtualTokens;
        const marketCapSOL = pricePerTokenSOL * totalSupply;
        const marketCapUSD = marketCapSOL * SOL_TO_USD;

        // بررسی آیا این ATH جدید است
        if (marketCapUSD > athUSD) {
          athSOL = marketCapSOL;
          athUSD = marketCapUSD;
          athTimestamp = record.createdAt;
        }
      }
    }

    // محاسبه مارکت کپ فعلی (آخرین رکورد)
    const lastRecord = allRecords[allRecords.length - 1];
    const currentVirtualSol = Number(lastRecord.virtualSolReserves) / LAMPORTS_PER_SOL;
    const currentVirtualTokens = Number(lastRecord.virtualTokenReserves) / 1e9;
    const currentTotalSupply = Number(lastRecord.tokenTotalSupply) / 1e9;

    let currentMarketCapSOL = 0;
    let currentMarketCapUSD = 0;

    if (currentVirtualTokens > 0) {
      const currentPriceSOL = currentVirtualSol / currentVirtualTokens;
      currentMarketCapSOL = currentPriceSOL * currentTotalSupply;
      currentMarketCapUSD = currentMarketCapSOL * SOL_TO_USD;
    }

    const percentageFromATH = athUSD > 0 ? ((currentMarketCapUSD - athUSD) / athUSD) * 100 : 0;

    athResults.push({
      curveAddress,
      athSOL,
      athUSD,
      athTimestamp,
      currentMarketCapSOL,
      currentMarketCapUSD,
      percentageFromATH
    });

    console.log(`\n📈 ${curveAddress}`);
    console.log(`   ATH: $${athUSD.toLocaleString()} (${athSOL.toFixed(6)} SOL)`);
    console.log(`   ATH Date: ${athTimestamp.toLocaleString()}`);
    console.log(`   Current: $${currentMarketCapUSD.toLocaleString()} (${currentMarketCapSOL.toFixed(6)} SOL)`);
    console.log(`   From ATH: ${percentageFromATH.toFixed(2)}%`);
  }

  // مرتب‌سازی بر اساس ATH
  athResults.sort((a, b) => b.athUSD - a.athUSD);

  return athResults;
}

// ذخیره نتایج در فایل
function saveATHToFile(athResults: ATHRecord[]): void {
  const fs = require('fs');
  const path = require('path');
  
  const data = athResults.map(result => ({
    ...result,
    athTimestamp: result.athTimestamp.toISOString()
  }));

  const filePath = path.join(process.cwd(), 'ath_results.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`\n💾 ATH results saved to: ${filePath}`);
}

// اجرای اصلی
async function main() {
  console.log("🚀 Calculating ATH for all curves...");
  
  const athResults = await calculateATHForAllCurves();
  
  console.log(`\n🎉 ATH Calculation Completed!`);
  console.log(`📊 Total curves analyzed: ${athResults.length}`);
  
  // نمایش 10 تاکن برتر بر اساس ATH
  console.log(`\n🏆 TOP 10 BY ATH:`);
  athResults.slice(0, 10).forEach((result, index) => {
    console.log(`${index + 1}. ${result.curveAddress}`);
    console.log(`   ATH: $${result.athUSD.toLocaleString()}`);
    console.log(`   Current: $${result.currentMarketCapUSD.toLocaleString()}`);
    console.log(`   Date: ${result.athTimestamp.toLocaleDateString()}`);
    console.log(`   Change: ${result.percentageFromATH.toFixed(2)}%`);
    console.log('');
  });

  saveATHToFile(athResults);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(console.error);
}