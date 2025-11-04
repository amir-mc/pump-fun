// index.ts - نسخه با مانیتورینگ مداوم 10 ثانیه‌ای برای هر توکن
import * as dotenv from 'dotenv';
import { PumpPortalListener } from './listeners/PumpPortalListener';
import { TokenInfo } from './types';
import { checkTokenStatus, getBondingCurveState } from './curve/get_bonding_curve_status';
import { PrismaClient } from './generated/prisma';
import { saveTokenToDB } from './services/dbService';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAndSaveSignaturesForCurve } from './curve/get_signature';

// Load environment variables
dotenv.config();

// ایجاد کلاینت Prisma
const prisma = new PrismaClient();

// سیستم مانیتورینگ مداوم
class ContinuousTokenMonitor {
  private isMonitoring = false;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private connection: Connection;
  private readonly MONITOR_INTERVAL = 10000; // 10 ثانیه

  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_NODE_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com", 
      "confirmed"
    );
  }

  // شروع مانیتورینگ برای یک توکن جدید
  async startMonitoringToken(tokenInfo: TokenInfo): Promise<void> {
    const tokenKey = tokenInfo.mint;
    
    if (this.monitoringIntervals.has(tokenKey)) {
      console.log(`🔄 Token ${tokenInfo.name} is already being monitored`);
      return;
    }

    console.log(`🎯 Starting continuous monitoring for ${tokenInfo.name} (every 10s)`);
    
    // اولین اجرا بلافاصله
    await this.monitorSingleToken(tokenInfo);
    
    // سپس هر 10 ثانیه تکرار کن
    const interval = setInterval(async () => {
      await this.monitorSingleToken(tokenInfo);
    }, this.MONITOR_INTERVAL);
    
    this.monitoringIntervals.set(tokenKey, interval);
    this.isMonitoring = true;
    
    console.log(`✅ Continuous monitoring started for ${tokenInfo.name}`);
  }

  // مانیتورینگ یک توکن خاص
  private async monitorSingleToken(tokenInfo: TokenInfo): Promise<void> {
    try {
      console.log(`\n🔄 [${new Date().toLocaleTimeString()}] Monitoring ${tokenInfo.name}...`);
      
      const curveAddress = new PublicKey(tokenInfo.bondingCurve);
      const curveState = await getBondingCurveState(this.connection, curveAddress);

      const curveStateProps = {
        virtual_token_reserves: curveState.virtual_token_reserves,
        virtual_sol_reserves: curveState.virtual_sol_reserves,
        real_token_reserves: curveState.real_token_reserves,
        real_sol_reserves: curveState.real_sol_reserves,
        token_total_supply: curveState.token_total_supply,
        complete: curveState.complete,
        creator: curveState.creator
      };

      // اگر complete شده باشد، مانیتورینگ را متوقف کن
      if (curveState.complete) {
        console.log(`🎉 ${tokenInfo.name} completed bonding curve! Stopping monitoring.`);
        this.stopMonitoringToken(tokenInfo.mint);
        
        // یک بار آخر signatureهای نهایی رو بگیر
        await getAndSaveSignaturesForCurve(tokenInfo.bondingCurve, curveStateProps);
        return;
      }

      // گرفتن و ذخیره signatureهای جدید
      await getAndSaveSignaturesForCurve(tokenInfo.bondingCurve, curveStateProps);
      
      console.log(`✅ Updated ${tokenInfo.name} - Next check in 10s`);

    } catch (error: any) {
      console.error(`❌ Error monitoring ${tokenInfo.name}:`, error.message);
    }
  }

  // توقف مانیتورینگ برای یک توکن خاص
  stopMonitoringToken(tokenMint: string): void {
    const interval = this.monitoringIntervals.get(tokenMint);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(tokenMint);
      console.log(`🛑 Stopped monitoring for token: ${tokenMint}`);
    }
    
    if (this.monitoringIntervals.size === 0) {
      this.isMonitoring = false;
    }
  }

  // توقف تمام مانیتورینگ‌ها
  stopAllMonitoring(): void {
    console.log('🛑 Stopping all token monitoring...');
    for (const [tokenMint, interval] of this.monitoringIntervals) {
      clearInterval(interval);
    }
    this.monitoringIntervals.clear();
    this.isMonitoring = false;
    console.log('✅ All monitoring stopped');
  }

  // گرفتن وضعیت مانیتورینگ
  getMonitoringStatus(): { monitoringCount: number; tokens: string[] } {
    return {
      monitoringCount: this.monitoringIntervals.size,
      tokens: Array.from(this.monitoringIntervals.keys())
    };
  }

  isRunning(): boolean {
    return this.isMonitoring;
  }
}

// ایجاد نمونه مانیتورینگ
const tokenMonitor = new ContinuousTokenMonitor();

// Callback برای پردازش توکن‌های جدید
const handleNewToken = async (tokenInfo: TokenInfo): Promise<void> => {
  console.log(`\n🎯 ========================================`);
  console.log(`🆕 NEW PUMP.FUN TOKEN DETECTED!`);
  console.log(`🎯 ========================================`);
  console.log(`Name: ${tokenInfo.name}`);
  console.log(`Symbol: ${tokenInfo.symbol}`);
  console.log(`Mint: ${tokenInfo.mint}`);
  console.log(`Bonding Curve: ${tokenInfo.bondingCurve}`);
  console.log(`Creator: ${tokenInfo.creator}`);
  console.log(`============================================\n`);
  
  try {
    // مرحله 1: ذخیره توکن در دیتابیس
    console.log(`💾 Step 1: Saving token to database...`);
    await saveTokenToDB(tokenInfo);
    console.log(`✅ Token ${tokenInfo.name} saved successfully`);

    // مرحله 2: بررسی وضعیت توکن بعد از 1 ثانیه
    console.log(`⏳ Step 2: Waiting 1 seconds for initial token status...`);
    await new Promise(r => setTimeout(r, 1900));
    
    console.log(`🔍 Checking initial token status...`);
    await checkTokenStatus(tokenInfo);
    console.log(`✅ Initial token status updated`);

    // مرحله 3: گرفتن signatureهای اولیه بعد از 5 ثانیه
    console.log(`⏳ Step 3: Waiting 5s before initial signature fetch...`);
    await new Promise(r => setTimeout(r, 5000));

    console.log(`📝 Fetching initial signatures for ${tokenInfo.name}...`);
    const conn = new Connection(process.env.SOLANA_NODE_RPC_ENDPOINT!, "confirmed");
    const curveAddress = new PublicKey(tokenInfo.bondingCurve);
    const curveState = await getBondingCurveState(conn, curveAddress);

    // اجرای تابع مخصوص ثبت signature ها
    await getAndSaveSignaturesForCurve(tokenInfo.bondingCurve, {
      virtual_token_reserves: curveState.virtual_token_reserves,
      virtual_sol_reserves: curveState.virtual_sol_reserves,
      real_token_reserves: curveState.real_token_reserves,
      real_sol_reserves: curveState.real_sol_reserves,
      token_total_supply: curveState.token_total_supply,
      complete: curveState.complete,
      creator: curveState.creator
    });

    // مرحله 4: شروع مانیتورینگ مداوم هر 10 ثانیه
    console.log(`\n🚀 Step 4: Starting continuous monitoring (every 10s)...`);
    await tokenMonitor.startMonitoringToken(tokenInfo);

    console.log(`🎉 Successfully setup continuous monitoring for: ${tokenInfo.name}`);
    console.log(`⏰ Will check for new transactions every 10 seconds`);

    // نمایش وضعیت مانیتورینگ
    const status = tokenMonitor.getMonitoringStatus();
    console.log(`📊 Monitoring ${status.monitoringCount} tokens:`, status.tokens);

  } catch (error: any) {
    console.error(`💥 Error processing token ${tokenInfo.name}:`, error.message);
    
    if (error.stack) {
      console.error(`🔍 Error stack:`, error.stack);
    }
  }
};

// تابع اصلی
async function main() {
  console.log("🎯 ========================================");
  console.log("🚀 STARTING PUMP.FUN CONTINUOUS MONITORING");
  console.log("🎯 ========================================");
  console.log("📅", new Date().toISOString());
  console.log("⏰ Continuous monitoring: EVERY 10 SECONDS");
  console.log("============================================\n");

  const listener = new PumpPortalListener();

  try {
    // شروع لیستنر برای توکن‌های جدید
    console.log("👂 Step 1: Starting WebSocket listener for new tokens...");
    await listener.startListening(handleNewToken);
    console.log("✅ WebSocket listener started successfully");

    // نمایش وضعیت هر 30 ثانیه
    setInterval(() => {
      const status = tokenMonitor.getMonitoringStatus();
      const now = new Date();
      console.log(`\n📊 [${now.toLocaleTimeString()}] System Status:`);
      console.log(`   📈 Monitoring ${status.monitoringCount} tokens`);
      console.log(`   ⏰ Next checks every 10 seconds`);
      if (status.monitoringCount > 0) {
        console.log(`   🎯 Tokens: ${status.tokens.slice(0, 3).join(', ')}${status.tokens.length > 3 ? '...' : ''}`);
      }
    }, 30000);

    console.log("\n🎉 ========================================");
    console.log("✅ CONTINUOUS MONITORING SYSTEM STARTED!");
    console.log("============================================");
    console.log("📡 Real-time token discovery: ACTIVE");
    console.log("🔄 Continuous monitoring (10s): ACTIVE");
    console.log("💾 Database connection: ACTIVE");
    console.log("============================================\n");

  } catch (error: any) {
    console.error("💥 FATAL ERROR starting system:", error.message);
    
    if (error.stack) {
      console.error("🔍 Stack trace:", error.stack);
    }
    
    await gracefulShutdown();
    process.exit(1);
  }
}

// تابع خاموشی ایمن
async function gracefulShutdown() {
  console.log("\n🛑 ========================================");
  console.log("🛑 INITIATING GRACEFUL SHUTDOWN");
  console.log("============================================\n");

  try {
    // توقف تمام مانیتورینگ‌ها
    tokenMonitor.stopAllMonitoring();
    console.log("✅ All monitoring stopped");

    // بستن اتصال دیتابیس
    await prisma.$disconnect();
    console.log("✅ Database connection closed");

    console.log("\n🎯 ========================================");
    console.log("✅ SHUTDOWN COMPLETED SUCCESSFULLY");
    console.log("============================================\n");

  } catch (error: any) {
    console.error("❌ Error during shutdown:", error.message);
  }
}

// هندل کردن خاموشی
process.on('SIGINT', async () => {
  console.log("\n⚠️  Received SIGINT signal...");
  await gracefulShutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log("\n⚠️  Received SIGTERM signal...");
  await gracefulShutdown();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error.message);
  console.error('🔍 Stack:', error.stack);
  await gracefulShutdown();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
  await gracefulShutdown();
  process.exit(1);
});

// شروع برنامه
main().catch(async (error) => {
  console.error('💥 Application failed to start:', error);
  await gracefulShutdown();
  process.exit(1);
});