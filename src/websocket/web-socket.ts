import WebSocket, { WebSocketServer } from 'ws';
import { PrismaClient } from "../generated/prisma";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const prisma = new PrismaClient();
const wss = new WebSocketServer({ port: 8080 });

console.log('🚀 WebSocket Server running on port 8080');

let SOL_TO_USD = 172;
let isDatabaseConnected = false;

// تابع برای بررسی اتصال به دیتابیس
async function initializeDatabase(): Promise<boolean> {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    isDatabaseConnected = true;
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    isDatabaseConnected = false;
    return false;
  }
}

// تابع برای آپدیت قیمت SOL
async function updateSolPrice(): Promise<number> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const data = await res.json();
    if (data?.solana?.usd) {
      SOL_TO_USD = data.solana.usd;
      console.log(`💰 SOL Price Updated: $${SOL_TO_USD}`);
    }
    return SOL_TO_USD;
  } catch (e) {
    console.log('⚠️ Using default SOL price');
    return SOL_TO_USD;
  }
}

// تابع برای تبدیل BigInt به number
function bigIntToNumber(bigIntValue: bigint): number {
  return Number(bigIntValue);
}

// تابع برای محاسبه قیمت از فرمول واقعی
function calculateBondingCurvePrice(virtualSolReserves: bigint, virtualTokenReserves: bigint): number {
  const LAMPORTS_PER_SOL_BIGINT = 1_000_000_000n;
  const TOKEN_DECIMALS = 6;
  
  if (virtualTokenReserves <= 0n || virtualSolReserves <= 0n) {
    return 0;
  }

  const sol = bigIntToNumber(virtualSolReserves) / Number(LAMPORTS_PER_SOL);
  const tokens = bigIntToNumber(virtualTokenReserves) / 10 ** TOKEN_DECIMALS;

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
  const totalSupply = bigIntToNumber(tokenTotalSupply) / 10 ** TOKEN_DECIMALS;
  const marketCapSOL = priceSOL * totalSupply;
  const marketCapUSD = marketCapSOL * SOL_TO_USD;

  return { priceSOL, marketCapSOL, marketCapUSD };
}

// تابع برای گرفتن تاریخچه قیمت و مارکت کپ
async function getPriceHistory(curveAddress: string, limit: number = 200) {
  try {
    const records = await prisma.bondingCurveSignatureTest.findMany({
      where: { curveAddress },
      orderBy: { createdAt: 'asc' },
      take: limit
    });

    return records.map(record => {
      const { priceSOL, marketCapSOL, marketCapUSD } = calculateMarketCap(
        record.virtualSolReserves,
        record.virtualTokenReserves,
        record.tokenTotalSupply
      );

      return {
        x: record.createdAt.getTime(),
        y: priceSOL,
        marketCapUSD: marketCapUSD,
        marketCapSOL: marketCapSOL,
        priceSOL: priceSOL,
        priceUSD: priceSOL * SOL_TO_USD,
        virtualSolReserves: bigIntToNumber(record.virtualSolReserves),
        virtualTokenReserves: bigIntToNumber(record.virtualTokenReserves),
        tokenTotalSupply: bigIntToNumber(record.tokenTotalSupply)
      };
    });
  } catch (error) {
    console.error('Error fetching price history:', error);
    return [];
  }
}

// تابع برای محاسبه ATH بر اساس مارکت کپ
function calculateATHByMarketCap(priceHistory: any[]): {
  athSOL: number;
  athUSD: number;
  athTimestamp: string;
  percentageFromATH: number;
  athMarketCapUSD: number;
  athMarketCapSOL: number;
} {
  if (priceHistory.length === 0) {
    return {
      athSOL: 0,
      athUSD: 0,
      athTimestamp: new Date().toISOString(),
      percentageFromATH: 0,
      athMarketCapUSD: 0,
      athMarketCapSOL: 0
    };
  }

  // پیدا کردن بالاترین مارکت کپ در تاریخچه
  let athRecord = priceHistory[0];
  for (const record of priceHistory) {
    if (record.marketCapUSD > athRecord.marketCapUSD) {
      athRecord = record;
    }
  }

  const currentRecord = priceHistory[priceHistory.length - 1];
  const currentMarketCap = currentRecord?.marketCapUSD || 0;
  const percentageFromATH = athRecord.marketCapUSD > 0 
    ? ((currentMarketCap - athRecord.marketCapUSD) / athRecord.marketCapUSD) * 100 
    : 0;

  console.log(`🏆 ATH Calculation:`);
  console.log(`   - ATH Market Cap: $${athRecord.marketCapUSD}`);
  console.log(`   - ATH Price SOL: ${athRecord.priceSOL}`);
  console.log(`   - ATH Price USD: ${athRecord.priceUSD}`);
  console.log(`   - Current Market Cap: $${currentMarketCap}`);
  console.log(`   - Percentage from ATH: ${percentageFromATH}%`);

  return {
    athSOL: athRecord.priceSOL,
    athUSD: athRecord.priceUSD,
    athTimestamp: new Date(athRecord.x).toISOString(),
    percentageFromATH: percentageFromATH,
    athMarketCapUSD: athRecord.marketCapUSD,
    athMarketCapSOL: athRecord.marketCapSOL
  };
}

// تابع برای محاسبه قیمت لانچ
function calculateLaunchPrice(priceHistory: any[]): {
  launchPriceSOL: number;
  launchPriceUSD: number;
  launchTimestamp: string;
  launchMarketCapUSD: number;
  launchMarketCapSOL: number;
} {
  if (priceHistory.length === 0) {
    return {
      launchPriceSOL: 0,
      launchPriceUSD: 0,
      launchTimestamp: new Date().toISOString(),
      launchMarketCapUSD: 0,
      launchMarketCapSOL: 0
    };
  }

  const launchRecord = priceHistory[0];
  return {
    launchPriceSOL: launchRecord.priceSOL,
    launchPriceUSD: launchRecord.priceUSD,
    launchTimestamp: new Date(launchRecord.x).toISOString(),
    launchMarketCapUSD: launchRecord.marketCapUSD,
    launchMarketCapSOL: launchRecord.marketCapSOL
  };
}

// تابع برای گرفتن لیست curveهای موجود در دیتابیس
async function getAvailableCurves(): Promise<string[]> {
  try {
    const curves = await prisma.bondingCurveSignatureTest.findMany({
      select: { curveAddress: true },
      distinct: ['curveAddress'],
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    return curves.map(curve => curve.curveAddress);
  } catch (error) {
    console.error('Error fetching available curves:', error);
    return [];
  }
}

// تابع اصلی برای گرفتن اطلاعات کامل curve
async function getCompleteCurveData(curveAddress: string) {
  if (!isDatabaseConnected) {
    throw new Error('Database is not connected');
  }

  const latestRecord = await prisma.bondingCurveSignatureTest.findFirst({
    where: { curveAddress },
    orderBy: { createdAt: 'desc' }
  });

  if (!latestRecord) {
    throw new Error(`No data found for curve: ${curveAddress}`);
  }

  // محاسبات ساده - تبدیل تمام BigIntها به number
  const TOKEN_DECIMALS = 6;
  const virtualTokens = bigIntToNumber(latestRecord.virtualTokenReserves) / 10 ** TOKEN_DECIMALS;
  const virtualSol = bigIntToNumber(latestRecord.virtualSolReserves) / Number(LAMPORTS_PER_SOL);
  const realTokens = bigIntToNumber(latestRecord.realTokenReserves) / 10 ** TOKEN_DECIMALS;
  const realSol = bigIntToNumber(latestRecord.realSolReserves) / Number(LAMPORTS_PER_SOL);
  const totalSupply = bigIntToNumber(latestRecord.tokenTotalSupply) / 10 ** TOKEN_DECIMALS;

  const { priceSOL, marketCapSOL, marketCapUSD } = calculateMarketCap(
    latestRecord.virtualSolReserves,
    latestRecord.virtualTokenReserves,
    latestRecord.tokenTotalSupply
  );

  // گرفتن تاریخچه قیمت
  const priceHistory = await getPriceHistory(curveAddress, 200);
  
  // محاسبه ATH بر اساس مارکت کپ
  const athData = calculateATHByMarketCap(priceHistory);
  
  // محاسبه قیمت لانچ
  const launchData = calculateLaunchPrice(priceHistory);

  // محاسبه درصد تغییر از لانچ
  const percentageFromLaunch = launchData.launchPriceSOL > 0 
    ? ((priceSOL - launchData.launchPriceSOL) / launchData.launchPriceSOL) * 100 
    : 0;

  const result = {
    curveAddress,
    virtualTokens,
    virtualSol,
    realTokens,
    realSol,
    totalSupply,
    complete: latestRecord.complete,
    creator: latestRecord.creator || null,
    lastUpdated: latestRecord.createdAt.toISOString(),
    
    // قیمت و مارکت کپ فعلی
    currentPriceSOL: priceSOL,
    currentPriceUSD: priceSOL * SOL_TO_USD,
    currentMarketCapSOL: marketCapSOL,
    currentMarketCapUSD: marketCapUSD,
    
    // اطلاعات لانچ
    launchPriceSOL: launchData.launchPriceSOL,
    launchPriceUSD: launchData.launchPriceUSD,
    launchTimestamp: launchData.launchTimestamp,
    launchMarketCapUSD: launchData.launchMarketCapUSD,
    launchMarketCapSOL: launchData.launchMarketCapSOL,
    percentageFromLaunch: percentageFromLaunch,
    
    // ATH - بر اساس مارکت کپ
    athSOL: athData.athSOL,
    athUSD: athData.athUSD,
    athTimestamp: athData.athTimestamp,
    percentageFromATH: athData.percentageFromATH,
    athMarketCapUSD: athData.athMarketCapUSD,
    athMarketCapSOL: athData.athMarketCapSOL,
    
    // داده‌های چارت
    priceHistory: priceHistory,
    
    // متا داده
    solPrice: SOL_TO_USD,
    timestamp: new Date().toISOString()
  };

  // لاگ اطلاعات برای دیباگ
  console.log(`📊 Final Curve Data for ${curveAddress}:`);
  console.log(`   - Current Price: ${result.currentPriceSOL} SOL ($${result.currentPriceUSD})`);
  console.log(`   - ATH Price: ${result.athSOL} SOL ($${result.athUSD})`);
  console.log(`   - ATH Market Cap: $${result.athMarketCapUSD}`);
  console.log(`   - Percentage from ATH: ${result.percentageFromATH}%`);

  return result;
}

// تابع برای گرفتن داده همه curveهای موجود
async function getAllCurvesData() {
  const availableCurves = await getAvailableCurves();
  const allCurvesData = [];

  for (const curveAddress of availableCurves) {
    try {
      const curveData = await getCompleteCurveData(curveAddress);
      allCurvesData.push(curveData);
    } catch (error: any) {
      console.log(`⚠️ Skipping curve ${curveAddress}:`, error.message);
    }
  }

  // مرتب‌سازی بر اساس مارکت کپ
  return allCurvesData.sort((a, b) => b.currentMarketCapUSD - a.currentMarketCapUSD);
}

// تابع برای گرفتن Top ATH بر اساس مارکت کپ
async function getTopATH(limit: number = 10) {
  const availableCurves = await getAvailableCurves();
  const curvesWithATH = [];

  for (const curveAddress of availableCurves) {
    try {
      const curveData = await getCompleteCurveData(curveAddress);
      // فقط curveهایی که ATH معتبر دارند
      if (curveData.athMarketCapUSD > 1000) {
        curvesWithATH.push(curveData);
      }
    } catch (error: any) {
      console.log(`⚠️ Skipping curve ${curveAddress}:`, error.message);
    }
  }

  // مرتب‌سازی بر اساس ATH Market Cap
  return curvesWithATH
    .sort((a, b) => b.athMarketCapUSD - a.athMarketCapUSD)
    .slice(0, limit);
}

// مقداردهی اولیه
initializeDatabase().then(success => {
  if (success) {
    console.log('✅ Server is ready to handle requests');
    // آپدیت اولیه قیمت SOL
    updateSolPrice();
  } else {
    console.log('❌ Server started but database is unavailable');
  }
});

// مدیریت WebSocket connections
wss.on('connection', (ws) => {
  console.log('✅ New React client connected');

  // ارسال وضعیت اتصال
  ws.send(JSON.stringify({
    type: 'CONNECTION_STATUS',
    databaseConnected: isDatabaseConnected,
    solPrice: SOL_TO_USD
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      console.log(`📨 Received message type: ${data.type}`);

      // درخواست curveهای موجود
      if (data.type === 'GET_AVAILABLE_CURVES') {
        console.log('📊 Processing available curves request');
        const availableCurves = await getAvailableCurves();
        
        ws.send(JSON.stringify({
          type: 'AVAILABLE_CURVES',
          data: availableCurves,
          count: availableCurves.length
        }));
        
        console.log(`✅ Sent ${availableCurves.length} available curves`);
      }

      // درخواست داده یک curve خاص
      if (data.type === 'GET_CURVE_DATA') {
        const curveAddress = data.curveAddress;
        
        if (!curveAddress) {
          ws.send(JSON.stringify({ 
            type: 'ERROR', 
            message: 'Curve address is required' 
          }));
          return;
        }
        
        if (!isDatabaseConnected) {
          ws.send(JSON.stringify({ 
            type: 'ERROR', 
            message: 'Database is not available' 
          }));
          return;
        }

        console.log(`📊 Processing curve data request for: ${curveAddress}`);

        try {
          const curveData = await getCompleteCurveData(curveAddress);
          
          ws.send(JSON.stringify({
            type: 'CURVE_DATA',
            data: curveData
          }));
          
          console.log(`✅ Sent curve data for: ${curveAddress}`);
        } catch (error: any) {
          console.error(`❌ Error fetching curve ${curveAddress}:`, error.message);
          
          const availableCurves = await getAvailableCurves();
          
          ws.send(JSON.stringify({ 
            type: 'ERROR', 
            message: error.message,
            availableCurves: availableCurves
          }));
        }
      }

      // درخواست برای همه curves
      if (data.type === 'GET_ALL_CURVES') {
        console.log('📊 Processing all curves data request');
        
        if (!isDatabaseConnected) {
          ws.send(JSON.stringify({ 
            type: 'ERROR', 
            message: 'Database is not available' 
          }));
          return;
        }

        try {
          const allCurvesData = await getAllCurvesData();
          
          ws.send(JSON.stringify({
            type: 'ALL_CURVES_DATA',
            data: allCurvesData,
            count: allCurvesData.length,
            timestamp: new Date().toISOString()
          }));

          console.log(`✅ Sent data for ${allCurvesData.length} curves`);
        } catch (error: any) {
          console.error('❌ Error processing all curves:', error);
          ws.send(JSON.stringify({ 
            type: 'ERROR', 
            message: `Failed to process all curves: ${error.message}` 
          }));
        }
      }

      // درخواست Top ATH
      if (data.type === 'GET_TOP_ATH') {
        console.log('🏆 Processing top ATH request');
        
        if (!isDatabaseConnected) {
          ws.send(JSON.stringify({ 
            type: 'ERROR', 
            message: 'Database is not available' 
          }));
          return;
        }

        try {
          const limit = data.limit || 10;
          const topATHData = await getTopATH(limit);
          
          ws.send(JSON.stringify({
            type: 'TOP_ATH_DATA',
            data: topATHData,
            count: topATHData.length,
            timestamp: new Date().toISOString()
          }));

          console.log(`✅ Sent top ${topATHData.length} ATH curves`);
        } catch (error: any) {
          console.error('❌ Error processing top ATH:', error);
          ws.send(JSON.stringify({ 
            type: 'ERROR', 
            message: `Failed to process top ATH: ${error.message}` 
          }));
        }
      }

    } catch (error: any) {
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

  ws.on('error', (error) => {
    console.error('❌ WebSocket client error:', error);
  });
});

// آپدیت دوره‌ای قیمت SOL هر 5 دقیقه
setInterval(updateSolPrice, 300000);

// مدیریت graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down WebSocket server...');
  await prisma.$disconnect();
  wss.close(() => {
    console.log('✅ WebSocket server closed');
    process.exit(0);
  });
});

// هندل خطاهای unhandled
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});