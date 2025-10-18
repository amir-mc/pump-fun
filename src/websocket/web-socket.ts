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

// تابع برای محاسبه ATH (بر اساس کد getath.ts)
async function calculateATHForCurve(curveAddress: string): Promise<{
  athSOL: number;
  athUSD: number;
  athTimestamp: Date;
  currentMarketCapSOL: number;
  currentMarketCapUSD: number;
  percentageFromATH: number;
  currentPriceSOL: number;
  currentPriceUSD: number;
}> {
  await updateSolPrice();

  // گرفتن تمام رکوردهای این curve به ترتیب زمانی
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

  // محاسبه مقادیر فعلی (آخرین رکورد)
  const lastRecord = allRecords[allRecords.length - 1];
  const currentVirtualSol = Number(lastRecord.virtualSolReserves) / LAMPORTS_PER_SOL;
  const currentVirtualTokens = Number(lastRecord.virtualTokenReserves) / 1e9;
  const currentTotalSupply = Number(lastRecord.tokenTotalSupply) / 1e9;

  let currentPriceSOL = 0;
  let currentMarketCapSOL = 0;
  let currentMarketCapUSD = 0;

  if (currentVirtualTokens > 0) {
    currentPriceSOL = currentVirtualSol / currentVirtualTokens;
    currentMarketCapSOL = currentPriceSOL * currentTotalSupply;
    currentMarketCapUSD = currentMarketCapSOL * SOL_TO_USD;
  }

  const currentPriceUSD = currentPriceSOL * SOL_TO_USD;
  const percentageFromATH = athUSD > 0 ? ((currentMarketCapUSD - athUSD) / athUSD) * 100 : 0;

  return {
    athSOL,
    athUSD,
    athTimestamp,
    currentMarketCapSOL,
    currentMarketCapUSD,
    percentageFromATH,
    currentPriceSOL,
    currentPriceUSD
  };
}

// تابع برای گرفتن اطلاعات کامل curve
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

  // محاسبه مقادیر خوانا
  const virtualTokens = Number(latestRecord.virtualTokenReserves) / 1e9;
  const virtualSol = Number(latestRecord.virtualSolReserves) / LAMPORTS_PER_SOL;
  const realTokens = Number(latestRecord.realTokenReserves) / 1e9;
  const realSol = Number(latestRecord.realSolReserves) / LAMPORTS_PER_SOL;
  const totalSupply = Number(latestRecord.tokenTotalSupply) / 1e9;

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

    // اطلاعات ATH
    athSOL: athData.athSOL,
    athUSD: athData.athUSD,
    athTimestamp: athData.athTimestamp,
    percentageFromATH: athData.percentageFromATH,

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
        
        // پیدا کردن تمام curve addressهای منحصر به فرد
        const allCurves = await prisma.bondingCurveSignatureTest.findMany({
          select: { curveAddress: true },
          distinct: ['curveAddress'],
          take: 50 // محدودیت برای جلوگیری از overload
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

        // مرتب‌سازی بر اساس مارکت کپ
        allCurvesData.sort((a, b) => b.currentMarketCapUSD - a.currentMarketCapUSD);

        ws.send(JSON.stringify({
          type: 'ALL_CURVES_DATA',
          data: allCurvesData,
          count: allCurvesData.length,
          timestamp: new Date().toISOString()
        }));

        console.log(`✅ Sent data for ${allCurvesData.length} curves`);
      }

      // درخواست برای top curves بر اساس ATH
      if (data.type === 'GET_TOP_ATH') {
        const limit = data.limit || 10;
        
        console.log(`🏆 Processing top ${limit} ATH curves request`);

        const allCurves = await prisma.bondingCurveSignatureTest.findMany({
          select: { curveAddress: true },
          distinct: ['curveAddress'],
          take: 100
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

        // مرتب‌سازی بر اساس ATH
        const topATH = allCurvesData
          .filter(curve => curve.athUSD > 0)
          .sort((a, b) => b.athUSD - a.athUSD)
          .slice(0, limit);

        ws.send(JSON.stringify({
          type: 'TOP_ATH_DATA',
          data: topATH,
          count: topATH.length,
          timestamp: new Date().toISOString()
        }));

        console.log(`✅ Sent top ${topATH.length} ATH curves`);
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