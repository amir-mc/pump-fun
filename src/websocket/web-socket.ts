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
    if (data?.solana?.usd) SOL_TO_USD = data.solana.usd;
    console.log(`💰 SOL Price Updated: $${SOL_TO_USD}`);
    return SOL_TO_USD;
  } catch (e) {
    console.log('⚠️ Using default SOL price');
    return SOL_TO_USD;
  }
}

// تابع برای محاسبه قیمت از فرمول واقعی
function calculateBondingCurvePrice(virtualSolReserves: bigint, virtualTokenReserves: bigint): number {
  const LAMPORTS_PER_SOL = 1_000_000_000n;
  const TOKEN_DECIMALS = 6;
  
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

  // محاسبات ساده
  const TOKEN_DECIMALS = 6;
  const virtualTokens = Number(latestRecord.virtualTokenReserves) / 10 ** TOKEN_DECIMALS;
  const virtualSol = Number(latestRecord.virtualSolReserves) / Number(LAMPORTS_PER_SOL);
  const realTokens = Number(latestRecord.realTokenReserves) / 10 ** TOKEN_DECIMALS;
  const realSol = Number(latestRecord.realSolReserves) / Number(LAMPORTS_PER_SOL);
  const totalSupply = Number(latestRecord.tokenTotalSupply) / 10 ** TOKEN_DECIMALS;

  const { priceSOL, marketCapSOL, marketCapUSD } = calculateMarketCap(
    latestRecord.virtualSolReserves,
    latestRecord.virtualTokenReserves,
    latestRecord.tokenTotalSupply
  );

  return {
    curveAddress,
    virtualTokens,
    virtualSol,
    realTokens,
    realSol,
    totalSupply,
    complete: latestRecord.complete,
    creator: latestRecord.creator || null,
    lastUpdated: latestRecord.createdAt.toISOString(),
    currentPriceSOL: priceSOL,
    currentPriceUSD: priceSOL * SOL_TO_USD,
    currentMarketCapSOL: marketCapSOL,
    currentMarketCapUSD: marketCapUSD,
    solPrice: SOL_TO_USD,
    timestamp: new Date().toISOString()
  };
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

// مقداردهی اولیه
initializeDatabase().then(success => {
  if (success) {
    console.log('✅ Server is ready to handle requests');
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
    databaseConnected: isDatabaseConnected
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
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