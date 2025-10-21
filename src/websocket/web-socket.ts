import WebSocket, { WebSocketServer } from 'ws';
import { PrismaClient } from "../generated/prisma";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const prisma = new PrismaClient();
const wss = new WebSocketServer({ port: 8080 });

console.log('🚀 WebSocket Server running on port 8080');

let SOL_TO_USD = 172;

// تابع برای آپدیت قیمت SOL
async function updateSolPrice(): Promise<number> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const data = await res.json();
    if (data?.solana?.usd) SOL_TO_USD = data.solana.usd;
    console.log(`💰 SOL Price Updated: $${SOL_TO_USD}`);
    return SOL_TO_USD;
  } catch (e) {
    console.log('⚠️ Using default SOL price');
    return SOL_TO_USD;
  }
}

// تابع برای محاسبه قیمت از فرمول واقعی (مطابق کلاس شما)
function calculateBondingCurvePrice(virtualSolReserves: bigint, virtualTokenReserves: bigint): number {
  const LAMPORTS_PER_SOL = 1_000_000_000n;
  const TOKEN_DECIMALS = 6; // از کلاس شما
  
  if (virtualTokenReserves <= 0n || virtualSolReserves <= 0n) {
    return 0;
  }

  const sol = Number(virtualSolReserves) / Number(LAMPORTS_PER_SOL);
  const tokens = Number(virtualTokenReserves) / 10 ** TOKEN_DECIMALS;

  return sol / tokens;
}

// تابع برای محاسبه مارکت کپ
function calculateMarketCap(virtualSolReserves: bigint, virtualTokenReserves: bigint, tokenTotalSupply: bigint): {
  priceSOL: number;
  marketCapSOL: number;
  marketCapUSD: number;
} {
  const TOKEN_DECIMALS = 6;
  const priceSOL = calculateBondingCurvePrice(virtualSolReserves, virtualTokenReserves);
  const totalSupply = Number(tokenTotalSupply) / 10 ** TOKEN_DECIMALS;
  const marketCapSOL = priceSOL * totalSupply;
  const marketCapUSD = marketCapSOL * SOL_TO_USD;

  return { priceSOL, marketCapSOL, marketCapUSD };
}

// تابع برای ایجاد تاریخچه قیمت از داده‌های واقعی
async function createPriceHistory(curveAddress: string): Promise<any[]> {
  // گرفتن تمام رکوردها به ترتیب زمانی
  const allRecords = await prisma.bondingCurveSignatureTest.findMany({
    where: { curveAddress },
    orderBy: { createdAt: 'asc' }
  });

  if (allRecords.length === 0) return [];

  const priceHistory = [];
  
  // پیدا کردن قیمت لانچ (اولین رکورد)
  const launchRecord = allRecords[0];
  const launchPriceData = calculateMarketCap(
    launchRecord.virtualSolReserves,
    launchRecord.virtualTokenReserves,
    launchRecord.tokenTotalSupply
  );

  // اضافه کردن نقطه لانچ
  priceHistory.push({
    x: launchRecord.createdAt.getTime(),
    y: launchPriceData.priceSOL,
    marketCapUSD: launchPriceData.marketCapUSD,
    type: 'launch',
    label: 'Launch Price'
  });

  // اضافه کردن نقاط مهم دیگر (هر 10 رکورد یک نقطه)
  const step = Math.max(1, Math.floor(allRecords.length / 20));
  for (let i = 1; i < allRecords.length; i += step) {
    const record = allRecords[i];
    const priceData = calculateMarketCap(
      record.virtualSolReserves,
      record.virtualTokenReserves,
      record.tokenTotalSupply
    );

    priceHistory.push({
      x: record.createdAt.getTime(),
      y: priceData.priceSOL,
      marketCapUSD: priceData.marketCapUSD,
      type: 'history'
    });
  }

  // اضافه کردن آخرین نقطه
  const lastRecord = allRecords[allRecords.length - 1];
  const lastPriceData = calculateMarketCap(
    lastRecord.virtualSolReserves,
    lastRecord.virtualTokenReserves,
    lastRecord.tokenTotalSupply
  );

  priceHistory.push({
    x: lastRecord.createdAt.getTime(),
    y: lastPriceData.priceSOL,
    marketCapUSD: lastPriceData.marketCapUSD,
    type: 'current'
  });

  // مرتب‌سازی بر اساس زمان
  return priceHistory.sort((a, b) => a.x - b.x);
}

// تابع برای محاسبه ATH
async function calculateATHForCurve(curveAddress: string): Promise<{
  athSOL: number;
  athUSD: number;
  athTimestamp: Date;
  launchPriceSOL: number;
  launchPriceUSD: number;
  launchTimestamp: Date;
  currentMarketCapSOL: number;
  currentMarketCapUSD: number;
  percentageFromATH: number;
  currentPriceSOL: number;
  currentPriceUSD: number;
}> {
  await updateSolPrice();

  // گرفتن تمام رکوردها
  const allRecords = await prisma.bondingCurveSignatureTest.findMany({
    where: { curveAddress },
    orderBy: { createdAt: 'asc' }
  });

  if (allRecords.length === 0) {
    throw new Error('No records found for this curve address');
  }

  let athSOL = 0;
  let athUSD = 0;
  let athTimestamp = new Date(0);

  // محاسبه ATH از تاریخچه
  for (const record of allRecords) {
    const { priceSOL, marketCapSOL, marketCapUSD } = calculateMarketCap(
      record.virtualSolReserves,
      record.virtualTokenReserves,
      record.tokenTotalSupply
    );

    // بررسی آیا این ATH جدید است
    if (marketCapUSD > athUSD) {
      athSOL = marketCapSOL;
      athUSD = marketCapUSD;
      athTimestamp = record.createdAt;
    }
  }

  // محاسبه قیمت لانچ
  const launchRecord = allRecords[0];
  const { 
    priceSOL: launchPriceSOL, 
    marketCapUSD: launchPriceUSD 
  } = calculateMarketCap(
    launchRecord.virtualSolReserves,
    launchRecord.virtualTokenReserves,
    launchRecord.tokenTotalSupply
  );

  // محاسبه مقادیر فعلی (آخرین رکورد)
  const lastRecord = allRecords[allRecords.length - 1];
  const { 
    priceSOL: currentPriceSOL, 
    marketCapSOL: currentMarketCapSOL, 
    marketCapUSD: currentMarketCapUSD 
  } = calculateMarketCap(
    lastRecord.virtualSolReserves,
    lastRecord.virtualTokenReserves,
    lastRecord.tokenTotalSupply
  );

  const currentPriceUSD = currentPriceSOL * SOL_TO_USD;
  const percentageFromATH = athUSD > 0 ? ((currentMarketCapUSD - athUSD) / athUSD) * 100 : 0;

  return {
    athSOL,
    athUSD,
    athTimestamp,
    launchPriceSOL,
    launchPriceUSD,
    launchTimestamp: launchRecord.createdAt,
    currentMarketCapSOL,
    currentMarketCapUSD,
    percentageFromATH,
    currentPriceSOL,
    currentPriceUSD
  };
}

// تابع اصلی برای گرفتن اطلاعات کامل curve
async function getCompleteCurveData(curveAddress: string) {
  const latestRecord = await prisma.bondingCurveSignatureTest.findFirst({
    where: { curveAddress },
    orderBy: { createdAt: 'desc' }
  });

  if (!latestRecord) {
    throw new Error('No recent data found for this curve');
  }

  // محاسبه ATH و اطلاعات فعلی
  const athData = await calculateATHForCurve(curveAddress);

  // ایجاد تاریخچه قیمت
  const priceHistory = await createPriceHistory(curveAddress);

  // محاسبه مقادیر خوانا از آخرین رکورد
  const TOKEN_DECIMALS = 6;
  const virtualTokens = Number(latestRecord.virtualTokenReserves) / 10 ** TOKEN_DECIMALS;
  const virtualSol = Number(latestRecord.virtualSolReserves) / Number(LAMPORTS_PER_SOL);
  const realTokens = Number(latestRecord.realTokenReserves) / 10 ** TOKEN_DECIMALS;
  const realSol = Number(latestRecord.realSolReserves) / Number(LAMPORTS_PER_SOL);
  const totalSupply = Number(latestRecord.tokenTotalSupply) / 10 ** TOKEN_DECIMALS;

  return {
    // اطلاعات پایه
    curveAddress,
    virtualTokens,
    virtualSol,
    realTokens,
    realSol,
    totalSupply,
    complete: latestRecord.complete,
    creator: latestRecord.creator || null,
    lastUpdated: latestRecord.createdAt,

    // اطلاعات قیمت و مارکت کپ
    currentPriceSOL: athData.currentPriceSOL,
    currentPriceUSD: athData.currentPriceUSD,
    currentMarketCapSOL: athData.currentMarketCapSOL,
    currentMarketCapUSD: athData.currentMarketCapUSD,

    // اطلاعات لانچ
    launchPriceSOL: athData.launchPriceSOL,
    launchPriceUSD: athData.launchPriceUSD,
    launchTimestamp: athData.launchTimestamp,

    // اطلاعات ATH
    athSOL: athData.athSOL,
    athUSD: athData.athUSD,
    athTimestamp: athData.athTimestamp,
    percentageFromATH: athData.percentageFromATH,

    // داده‌های چارت
    priceHistory,

    // اطلاعات اضافی
    solPrice: SOL_TO_USD,
    timestamp: new Date().toISOString()
  };
}

wss.on('connection', (ws) => {
  console.log('✅ New React client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'GET_CURVE_DATA') {
        const curveAddress = data.curveAddress || "pztfcvhCdyKwe9amAvd32fdo1E9gKMPw39m6yjaFYno";
        
        console.log(`📊 Processing curve data request for: ${curveAddress}`);

        const curveData = await getCompleteCurveData(curveAddress);

        const response = {
          type: 'CURVE_DATA',
          data: curveData
        };

        ws.send(JSON.stringify(response));
        console.log(`✅ Sent complete curve data for: ${curveAddress}`);
      }

      // درخواست برای همه curves
      if (data.type === 'GET_ALL_CURVES') {
        console.log('📊 Processing all curves data request');
        
        const allCurves = await prisma.bondingCurveSignatureTest.findMany({
          select: { curveAddress: true },
          distinct: ['curveAddress'],
          take: 50
        });

        const allCurvesData = [];

        for (const curve of allCurves) {
          try {
            const curveData = await getCompleteCurveData(curve.curveAddress);
            allCurvesData.push(curveData);
          } catch (error:any) {
            console.log(`⚠️ Skipping curve ${curve.curveAddress}:`, error.message);
          }
        }

        allCurvesData.sort((a, b) => b.currentMarketCapUSD - a.currentMarketCapUSD);

        ws.send(JSON.stringify({
          type: 'ALL_CURVES_DATA',
          data: allCurvesData,
          count: allCurvesData.length,
          timestamp: new Date().toISOString()
        }));

        console.log(`✅ Sent data for ${allCurvesData.length} curves`);
      }

    } catch (error:any) {
      console.error('❌ WebSocket error:', error);
      ws.send(JSON.stringify({ 
        type: 'ERROR', 
        message: error.message || 'Failed to process request' 
      }));
    }
  });

  ws.on('close', () => {
    console.log('❌ React client disconnected');
  });
});

// آپدیت دوره‌ای قیمت SOL هر 5 دقیقه
setInterval(updateSolPrice, 300000);

// مدیریت graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down WebSocket server...');
  await prisma.$disconnect();
  wss.close();
  process.exit(0);
});