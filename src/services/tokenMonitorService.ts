// services/tokenMonitorService.ts
import { PrismaClient } from '../generated/prisma';
import { getAndSaveSignaturesForCurve } from '../curve/get_signature';
import { Connection, PublicKey } from '@solana/web3.js';
import { getBondingCurveState, BondingCurveStateProps } from '../curve/get_bonding_curve_status';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const CHECK_INTERVAL = 20000; // 20 ثانیه

export class TokenMonitorService {
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private connection: Connection;

  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_NODE_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com", 
      "confirmed"
    );
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('🔄 Monitoring is already running');
      return;
    }

    console.log('🚀 Starting token monitoring service (20s intervals)...');
    this.isMonitoring = true;

    // اول یک بار اجرا کن
    await this.checkAllTokens();

    // سپس هر 20 ثانیه تکرار کن
    this.monitoringInterval = setInterval(async () => {
      await this.checkAllTokens();
    }, CHECK_INTERVAL);
  }

  async stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('🛑 Token monitoring stopped');
  }

  private async checkAllTokens(): Promise<void> {
    try {
      console.log(`\n🕒 [${new Date().toISOString()}] Checking all tokens for new signatures...`);
      
      // گرفتن تمام توکن‌های فعال از دیتابیس
      const allTokens = await prisma.token.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          mintAddress: true,
          name: true,
          symbol: true,
          bondingCurve: true,
          createdAt: true,
          complete: true
        }
      });

      // فقط توکن‌های incomplete را چک کن
      const activeTokens = allTokens.filter(token => !token.complete);
      
      console.log(`🔍 Found ${activeTokens.length} active tokens to check (from ${allTokens.length} total)`);

      let processed = 0;
      let errors = 0;

      for (const token of activeTokens) {
        try {
          await this.checkTokenSignatures(token);
          processed++;
          
          // تاخیر کوچک بین توکن‌ها برای جلوگیری از rate limit
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`❌ Error checking token ${token.name}:`, error);
          errors++;
        }
      }

      console.log(`✅ Monitoring cycle completed: ${processed} processed, ${errors} errors`);

    } catch (error) {
      console.error('❌ Error in monitoring cycle:', error);
    }
  }

  private async checkTokenSignatures(token: {
    mintAddress: string;
    name: string;
    symbol: string;
    bondingCurve: string;
    createdAt: Date;
    complete: boolean;
  }): Promise<void> {
    try {
      console.log(`\n🔄 Checking ${token.name} (${token.symbol})...`);
      
      // گرفتن وضعیت فعلی bonding curve
      const curveAddress = new PublicKey(token.bondingCurve);
      const curveState = await getBondingCurveState(this.connection, curveAddress);

      // تبدیل به BondingCurveStateProps برای استفاده در تابع اصلی
      const curveStateProps: BondingCurveStateProps = {
        virtual_token_reserves: curveState.virtual_token_reserves,
        virtual_sol_reserves: curveState.virtual_sol_reserves,
        real_token_reserves: curveState.real_token_reserves,
        real_sol_reserves: curveState.real_sol_reserves,
        token_total_supply: curveState.token_total_supply,
        complete: curveState.complete,
        creator: curveState.creator
      };

      // اگر complete شده باشد، آپدیت کن
      if (curveState.complete && !token.complete) {
        await prisma.token.update({
          where: { mintAddress: token.mintAddress },
          data: { complete: true }
        });
        console.log(`🎉 Token ${token.name} completed bonding curve!`);
      }

      // گرفتن و ذخیره signatureهای جدید
      await getAndSaveSignaturesForCurve(token.bondingCurve, curveStateProps);
      
      console.log(`✅ Successfully updated ${token.name}`);

    } catch (error: any) {
      console.error(`❌ Failed to check token ${token.name}:`, error.message);
      throw error;
    }
  }

  isRunning(): boolean {
    return this.isMonitoring;
  }

  async disconnect() {
    await prisma.$disconnect();
  }
}