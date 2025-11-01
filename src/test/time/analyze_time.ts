// comprehensive-analysis.ts
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PrismaClient } from "../../generated/prisma";


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

interface ComprehensiveAnalysis {
  totalTokens: number;
  analysisPeriod: string;
  
  // آمار کلی سود/ضرر
  averageGainToATH: number;
  averageGainToCurrent: number;
  medianGainToATH: number;
  medianGainToCurrent: number;
  
  // توزیع عملکرد
  performers: {
    gainersFromInitial: number;
    losersFromInitial: number;
    neutralFromInitial: number;
    
    gainersFromATH: number;
    losersFromATH: number;
    neutralFromATH: number;
  };
  
  // دسته‌بندی بر اساس عملکرد
  performanceCategories: {
    megaGainers: number; // +1000%
    highGainers: number; // +100% to +999%
    moderateGainers: number; // +10% to +99%
    slightGainers: number; // +1% to +9%
    neutral: number; // -1% to +1%
    slightLosers: number; // -1% to -9%
    moderateLosers: number; // -10% to -49%
    bigLosers: number; // -50% to -89%
    totalLosers: number; // -90% and below
  };
  
  // آمار زمانی
  averageTimeToATH: number;
  fastestTimeToATH: number;
  slowestTimeToATH: number;
  
  // نمونه‌های برجسته
  topPerformers: any[];
  worstPerformers: any[];
  fastestRisers: any[];
  
  // خلاصه مالی
  totalInitialMarketCap: number;
  totalATHMarketCap: number;
  totalCurrentMarketCap: number;
  totalValueChange: number;
}

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

  const pricePerTokenSOL = virtualSol / virtualTokens;
  const marketCapSOL = pricePerTokenSOL * totalSupplyTokens;

  return { pricePerTokenSOL, marketCapSOL };
}

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

async function getTokenAnalysisData() {
  await updateSolPrice();

  const allCurves = await prisma.bondingCurveSignatureTest.findMany({
    select: { curveAddress: true },
    distinct: ['curveAddress']
  });

  const analysisData = [];

  for (const curve of allCurves) {
    const curveAddress = curve.curveAddress;
    
    const allRecords = await prisma.bondingCurveSignatureTest.findMany({
      where: { curveAddress },
      orderBy: { createdAt: 'asc' }
    });

    if (allRecords.length === 0) continue;

    const firstRecord = allRecords[0];
    const lastRecord = allRecords[allRecords.length - 1];

    // محاسبه قیمت اولیه
    const { pricePerTokenSOL: initialPriceSOL, marketCapSOL: initialMarketCapSOL } = 
      calculateTokenPrice(
        firstRecord.virtualSolReserves,
        firstRecord.virtualTokenReserves,
        firstRecord.tokenTotalSupply
      );
    
    const initialPriceUSD = initialPriceSOL * SOL_TO_USD;

    let runningVirtualSol = Number(firstRecord.virtualSolReserves);
    let runningVirtualToken = Number(firstRecord.virtualTokenReserves);
    
    let athSOL = initialMarketCapSOL;
    let athUSD = initialMarketCapSOL * SOL_TO_USD;
    let athTimestamp = firstRecord.createdAt;

    // پیدا کردن ATH
    for (const record of allRecords) {
      const tokenDiff = Number(record.tokenDiff);

      if (tokenDiff > 0) {
        const currentPriceSOL = calculateTokenPrice(
          BigInt(Math.round(runningVirtualSol)),
          BigInt(Math.round(runningVirtualToken)),
          record.tokenTotalSupply
        ).pricePerTokenSOL;
        
        const solIncrease = (tokenDiff / 1e9) * currentPriceSOL * LAMPORTS_PER_SOL;
        runningVirtualSol += solIncrease;
        runningVirtualToken -= tokenDiff;
      } else if (tokenDiff < 0) {
        const currentPriceSOL = calculateTokenPrice(
          BigInt(Math.round(runningVirtualSol)),
          BigInt(Math.round(runningVirtualToken)),
          record.tokenTotalSupply
        ).pricePerTokenSOL;
        
        const solDecrease = (Math.abs(tokenDiff) / 1e9) * currentPriceSOL * LAMPORTS_PER_SOL;
        runningVirtualSol -= solDecrease;
        runningVirtualToken += Math.abs(tokenDiff);
      }

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

    // محاسبه قیمت فعلی
    const { marketCapSOL: currentMarketCapSOL } = calculateTokenPrice(
      BigInt(Math.round(runningVirtualSol)),
      BigInt(Math.round(runningVirtualToken)),
      lastRecord.tokenTotalSupply
    );
    
    const currentMarketCapUSD = currentMarketCapSOL * SOL_TO_USD;

    // محاسبه درصد تغییرات
    const gainToATH = initialMarketCapSOL > 0 ? 
      ((athSOL - initialMarketCapSOL) / initialMarketCapSOL) * 100 : 0;
    
    const gainToCurrent = initialMarketCapSOL > 0 ? 
      ((currentMarketCapSOL - initialMarketCapSOL) / initialMarketCapSOL) * 100 : 0;
    
    const changeFromATH = athSOL > 0 ? 
      ((currentMarketCapSOL - athSOL) / athSOL) * 100 : 0;

    // زمان رسیدن به ATH
    const timeToATHMinutes = (athTimestamp.getTime() - firstRecord.createdAt.getTime()) / (1000 * 60);

    const token = await prisma.token.findFirst({
      where: { bondingCurve: curveAddress }
    });

    analysisData.push({
      tokenName: token?.name || "Unknown",
      tokenSymbol: token?.symbol || "UNK",
      curveAddress,
      initialPriceUSD,
      initialMarketCapUSD: initialMarketCapSOL * SOL_TO_USD,
      athMarketCapUSD: athUSD,
      currentMarketCapUSD,
      gainToATH,
      gainToCurrent,
      changeFromATH,
      timeToATHMinutes,
      timeToATH: formatTimeDifference(firstRecord.createdAt, athTimestamp)
    });
  }

  return analysisData;
}

async function generateComprehensiveAnalysis(): Promise<ComprehensiveAnalysis> {
  const analysisData = await getTokenAnalysisData();
  
  if (analysisData.length === 0) {
    throw new Error("No data available for analysis");
  }

  // محاسبه میانگین‌ها
  const averageGainToATH = analysisData.reduce((sum, item) => sum + item.gainToATH, 0) / analysisData.length;
  const averageGainToCurrent = analysisData.reduce((sum, item) => sum + item.gainToCurrent, 0) / analysisData.length;
  
  // محاسبه میانه
  const gainsToATH = analysisData.map(item => item.gainToATH).sort((a, b) => a - b);
  const gainsToCurrent = analysisData.map(item => item.gainToCurrent).sort((a, b) => a - b);
  const medianGainToATH = gainsToATH[Math.floor(gainsToATH.length / 2)];
  const medianGainToCurrent = gainsToCurrent[Math.floor(gainsToCurrent.length / 2)];
  
  // توزیع عملکرد
  const performers = {
    gainersFromInitial: analysisData.filter(item => item.gainToCurrent > 0).length,
    losersFromInitial: analysisData.filter(item => item.gainToCurrent < 0).length,
    neutralFromInitial: analysisData.filter(item => item.gainToCurrent >= -1 && item.gainToCurrent <= 1).length,
    
    gainersFromATH: analysisData.filter(item => item.changeFromATH > 0).length,
    losersFromATH: analysisData.filter(item => item.changeFromATH < 0).length,
    neutralFromATH: analysisData.filter(item => item.changeFromATH >= -1 && item.changeFromATH <= 1).length
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
  const averageTimeToATH = timesToATH.reduce((sum, time) => sum + time, 0) / timesToATH.length;
  const fastestTimeToATH = Math.min(...timesToATH);
  const slowestTimeToATH = Math.max(...timesToATH);
  
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
  
  // خلاصه مالی
  const totalInitialMarketCap = analysisData.reduce((sum, item) => sum + item.initialMarketCapUSD, 0);
  const totalATHMarketCap = analysisData.reduce((sum, item) => sum + item.athMarketCapUSD, 0);
  const totalCurrentMarketCap = analysisData.reduce((sum, item) => sum + item.currentMarketCapUSD, 0);
  const totalValueChange = totalCurrentMarketCap - totalInitialMarketCap;

  return {
    totalTokens: analysisData.length,
    analysisPeriod: `Analysis of ${analysisData.length} tokens`,
    
    averageGainToATH,
    averageGainToCurrent,
    medianGainToATH,
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
    totalValueChange
  };
}

async function main() {
  try {
    console.log("📊 Generating Comprehensive Token Analysis...");
    console.log("=".repeat(80));
    
    const analysis = await generateComprehensiveAnalysis();
    
    console.log(`\n🎯 ANALYSIS SUMMARY`);
    console.log("=".repeat(80));
    console.log(`Total Tokens Analyzed: ${analysis.totalTokens}`);
    console.log(`Analysis Period: ${analysis.analysisPeriod}`);
    
    console.log(`\n💰 FINANCIAL PERFORMANCE`);
    console.log("-".repeat(40));
    console.log(`Average Gain to ATH: ${analysis.averageGainToATH > 0 ? '🟢' : '🔴'} ${analysis.averageGainToATH.toFixed(2)}%`);
    console.log(`Average Gain to Current: ${analysis.averageGainToCurrent > 0 ? '🟢' : '🔴'} ${analysis.averageGainToCurrent.toFixed(2)}%`);
    console.log(`Median Gain to Current: ${analysis.medianGainToCurrent > 0 ? '🟢' : '🔴'} ${analysis.medianGainToCurrent.toFixed(2)}%`);
    
    console.log(`\n📈 PERFORMANCE DISTRIBUTION`);
    console.log("-".repeat(40));
    console.log(`Gainers from Launch: ${analysis.performers.gainersFromInitial} (${((analysis.performers.gainersFromInitial / analysis.totalTokens) * 100).toFixed(1)}%)`);
    console.log(`Losers from Launch: ${analysis.performers.losersFromInitial} (${((analysis.performers.losersFromInitial / analysis.totalTokens) * 100).toFixed(1)}%)`);
    console.log(`Neutral from Launch: ${analysis.performers.neutralFromInitial} (${((analysis.performers.neutralFromInitial / analysis.totalTokens) * 100).toFixed(1)}%)`);
    
    console.log(`\n🎪 PERFORMANCE CATEGORIES`);
    console.log("-".repeat(40));
    console.log(`Mega Gainers (+1000%): ${analysis.performanceCategories.megaGainers}`);
    console.log(`High Gainers (+100% to +999%): ${analysis.performanceCategories.highGainers}`);
    console.log(`Moderate Gainers (+10% to +99%): ${analysis.performanceCategories.moderateGainers}`);
    console.log(`Slight Gainers (+1% to +9%): ${analysis.performanceCategories.slightGainers}`);
    console.log(`Neutral (±1%): ${analysis.performanceCategories.neutral}`);
    console.log(`Slight Losers (-1% to -9%): ${analysis.performanceCategories.slightLosers}`);
    console.log(`Moderate Losers (-10% to -49%): ${analysis.performanceCategories.moderateLosers}`);
    console.log(`Big Losers (-50% to -89%): ${analysis.performanceCategories.bigLosers}`);
    console.log(`Total Losers (-90%+): ${analysis.performanceCategories.totalLosers}`);
    
    console.log(`\n⏰ TIME ANALYSIS`);
    console.log("-".repeat(40));
    console.log(`Average Time to ATH: ${analysis.averageTimeToATH.toFixed(1)} minutes`);
    console.log(`Fastest Time to ATH: ${analysis.fastestTimeToATH.toFixed(1)} minutes`);
    console.log(`Slowest Time to ATH: ${analysis.slowestTimeToATH.toFixed(1)} minutes`);
    
    console.log(`\n💎 MARKET CAP SUMMARY`);
    console.log("-".repeat(40));
    console.log(`Total Initial Market Cap: $${analysis.totalInitialMarketCap.toFixed(2)}`);
    console.log(`Total ATH Market Cap: $${analysis.totalATHMarketCap.toFixed(2)}`);
    console.log(`Total Current Market Cap: $${analysis.totalCurrentMarketCap.toFixed(2)}`);
    console.log(`Total Value Change: $${analysis.totalValueChange > 0 ? '🟢' : '🔴'} ${analysis.totalValueChange.toFixed(2)}`);
    
    console.log(`\n🏆 TOP 5 PERFORMERS`);
    console.log("-".repeat(40));
    analysis.topPerformers.forEach((token, index) => {
      console.log(`${index + 1}. ${token.tokenName} (${token.tokenSymbol})`);
      console.log(`   Gain: 🟢 ${token.gainToCurrent.toFixed(2)}%`);
      console.log(`   Initial: $${token.initialPriceUSD.toFixed(4)} → Current: $${(token.currentMarketCapUSD / 1000).toFixed(2)}K`);
      console.log(`   Time to ATH: ${token.timeToATH}`);
    });
    
    console.log(`\n📉 WORST 5 PERFORMERS`);
    console.log("-".repeat(40));
    analysis.worstPerformers.forEach((token, index) => {
      console.log(`${index + 1}. ${token.tokenName} (${token.tokenSymbol})`);
      console.log(`   Loss: 🔴 ${token.gainToCurrent.toFixed(2)}%`);
      console.log(`   Initial: $${token.initialPriceUSD.toFixed(4)} → Current: $${(token.currentMarketCapUSD / 1000).toFixed(2)}K`);
    });
    
    console.log(`\n⚡ FASTEST 5 RISERS`);
    console.log("-".repeat(40));
    analysis.fastestRisers.forEach((token, index) => {
      console.log(`${index + 1}. ${token.tokenName} (${token.tokenSymbol})`);
      console.log(`   Time to ATH: ${token.timeToATH}`);
      console.log(`   Gain to ATH: 🟢 ${token.gainToATH.toFixed(2)}%`);
    });
    
    console.log(`\n💡 KEY INSIGHTS`);
    console.log("-".repeat(40));
    
    const successRate = (analysis.performers.gainersFromInitial / analysis.totalTokens) * 100;
    const avgHoldReturn = analysis.averageGainToCurrent;
    
    console.log(`📈 Success Rate: ${successRate.toFixed(1)}% of tokens are profitable from launch`);
    console.log(`💰 Average Return: ${avgHoldReturn > 0 ? '🟢' : '🔴'} ${avgHoldReturn.toFixed(2)}% per token`);
    console.log(`🎯 Median Return: ${analysis.medianGainToCurrent > 0 ? '🟢' : '🔴'} ${analysis.medianGainToCurrent.toFixed(2)}%`);
    console.log(`⚡ Average Time to Peak: ${analysis.averageTimeToATH.toFixed(1)} minutes`);
    
    if (analysis.totalTokens >= 5) {
      console.log(`\n📊 PORTFOLIO SIMULATION`);
      console.log("-".repeat(40));
      console.log(`If you invested $100 in each of ${analysis.totalTokens} tokens:`);
      console.log(`Total Investment: $${(analysis.totalTokens * 100).toFixed(0)}`);
      console.log(`Expected Value: $${(analysis.totalTokens * 100 * (1 + avgHoldReturn / 100)).toFixed(0)}`);
      console.log(`Expected Return: ${avgHoldReturn > 0 ? '🟢' : '🔴'} $${(analysis.totalTokens * 100 * (avgHoldReturn / 100)).toFixed(0)}`);
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("🎉 Comprehensive Analysis Completed!");
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error in comprehensive analysis:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}