import { Connection, clusterApiUrl, PublicKey } from "@solana/web3.js";
import { PrismaClient } from '../generated/prisma';

// ایجاد کلاینت Prisma
const prisma = new PrismaClient();

export async function GetTokenCurve(bondingCurveKey: string): Promise<PublicKey> {
  return new Promise((resolve, reject) => {
    console.log(`⏳ Received bonding curve key: ${bondingCurveKey}. Will process in 30 seconds...`);

    setTimeout(async () => {
      try {
        const curvePubkey = new PublicKey(bondingCurveKey);
        console.log(`✅ Processing bonding curve after delay: ${curvePubkey.toBase58()}`);
        resolve(curvePubkey);
      } catch (err) {
        console.error(`❌ Invalid bonding curve key: ${bondingCurveKey}`, err);
        reject(err);
      }
    }, 30000);
  });
}

class AdvancedTransactionAnalyzer {
  private connection: Connection;
  private prisma: PrismaClient;

  constructor() {
    this.connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
    this.prisma = new PrismaClient();
  }

  // تابع جدید برای خواندن signatures از دیتابیس
  private async getSignaturesFromDatabase(options?: {
    limit?: number;
    complete?: boolean;
    recent?: boolean;
  }): Promise<string[]> {
    try {
      const {
        limit = 50,
        complete = false,
        recent = true
      } = options || {};

      console.log(`📊 Fetching signatures from database...`);
      console.log(`   Limit: ${limit}, Complete: ${complete}, Recent: ${recent}`);

      // ساخت کوئری بر اساس پارامترها
      const tokens = await this.prisma.token.findMany({
        where: {
          complete: complete
        },
        orderBy: recent ? { timestamp: 'desc' } : { timestamp: 'asc' },
        take: limit,
        select: {
          signature: true,
          mintAddress: true,
          name: true,
          symbol: true,
          timestamp: true
        }
      });

      console.log(`✅ Found ${tokens.length} tokens in database`);

      // نمایش اطلاعات توکن‌های یافت شده
      tokens.forEach((token, index) => {
        console.log(`   ${index + 1}. ${token.symbol} - ${token.name}`);
        console.log(`      Signature: ${token.signature}`);
        console.log(`      Mint: ${token.mintAddress}`);
        console.log(`      Time: ${token.timestamp}`);
      });

      // استخراج فقط signatures
      return tokens.map(token => token.signature);

    } catch (error) {
      console.error('❌ Error fetching signatures from database:', error);
      return [];
    }
  }

  // تابع برای فیلتر کردن signatures خاص
  private async getFilteredSignatures(filters?: {
    symbol?: string;
    creator?: string;
    dateRange?: { start: Date; end: Date };
    minSupply?: bigint;
  }): Promise<string[]> {
    try {
      const whereClause: any = {};

      if (filters?.symbol) {
        whereClause.symbol = { contains: filters.symbol, mode: 'insensitive' };
      }

      if (filters?.creator) {
        whereClause.creator = filters.creator;
      }

      if (filters?.dateRange) {
        whereClause.timestamp = {
          gte: filters.dateRange.start,
          lte: filters.dateRange.end
        };
      }

      if (filters?.minSupply) {
        whereClause.totalSupply = { gte: filters.minSupply };
      }

      const tokens = await this.prisma.token.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' },
        take: 100,
        select: { signature: true }
      });

      console.log(`🔍 Found ${tokens.length} tokens matching filters`);
      return tokens.map(token => token.signature);

    } catch (error) {
      console.error('❌ Error fetching filtered signatures:', error);
      return [];
    }
  }

  // تابع اصلی آنالیز با دیتابیس
  public async analyzeFromDatabase(options?: {
    limit?: number;
    complete?: boolean;
    filters?: any;
  }): Promise<void> {
    try {
      console.log('🚀 Starting analysis from database...');

      // دریافت signatures از دیتابیس
      const signatures = options?.filters 
        ? await this.getFilteredSignatures(options.filters)
        : await this.getSignaturesFromDatabase(options);

      if (signatures.length === 0) {
        console.log('❌ No signatures found in database');
        return;
      }

      console.log(`\n🎯 Analyzing ${signatures.length} transactions from database...`);

      // آنالیز هر signature
      for (const signature of signatures) {
        await this.analyze(signature);
        console.log("\n" + "=".repeat(50) + "\n");
        
        // تاخیر کوچک برای جلوگیری از rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error) {
      console.error('❌ Error in database analysis:', error);
    } finally {
      // بستن اتصال دیتابیس
      await this.prisma.$disconnect();
    }
  }

  // تابع آنالیز اصلی (همانند قبل)
  public async analyze(signature: string): Promise<void> {
    console.log(`🔎 Analyzing signature: ${signature}`);

    const tx = await this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!tx) {
      console.error("❌ Transaction not found!");
      return;
    }

    console.log("✅ Transaction found!");
    console.log("Block Time:", tx.blockTime ? new Date(tx.blockTime * 1000) : "Unknown");
    console.log("Slot:", tx.slot);
    console.log("Fee:", tx.meta?.fee ? `${tx.meta.fee / 1e9} SOL` : "Unknown");

    await this.analyzeSOLChanges(tx);
    await this.analyzeTokenChanges(tx);
    await this.analyzeInstructions(tx);
    await this.analyzeTransactionResults(tx);
  }

  // متدهای کمکی (همانند قبل)
  private async analyzeSOLChanges(tx: any): Promise<void> {
    console.log("\n💰 SOL Balance Changes:");
    let totalSOLChange = 0;
    
    tx.meta?.postBalances.forEach((balance: number, i: number) => {
      const pre = tx.meta?.preBalances[i] ?? 0;
      const diff = balance - pre;
      
      if (diff !== 0) {
        const solAmount = diff / 1e9;
        totalSOLChange += solAmount;
        
        const accountType = this.getAccountType(i, tx);
        console.log(`   ${accountType} ${i}: ${diff > 0 ? '📈 +' : '📉 '}${solAmount.toFixed(6)} SOL`);
      }
    });

    console.log(`   📊 Total SOL Flow: ${totalSOLChange.toFixed(6)} SOL`);
  }

  private async analyzeTokenChanges(tx: any): Promise<void> {
    console.log("\n🪙 Token Balance Changes:");
    
    if (tx.meta?.preTokenBalances && tx.meta?.postTokenBalances) {
      for (let i = 0; i < tx.meta.preTokenBalances.length; i++) {
        const pre = tx.meta.preTokenBalances[i];
        const post = tx.meta.postTokenBalances[i];
        
        if (pre.mint === post.mint) {
          const change = (post.uiTokenAmount.uiAmount || 0) - (pre.uiTokenAmount.uiAmount || 0);
          
          if (change !== 0) {
            const mintAddress = pre.mint;
            const symbol = post.uiTokenAmount.symbol || 'Unknown';
            console.log(`   ${change > 0 ? '🟢 +' : '🔴 '}${change.toLocaleString()} ${symbol}`);
            console.log(`     Mint: ${mintAddress}`);
          }
        }
      }
    } else {
      console.log("   No token balance changes detected");
    }
  }

  private async analyzeInstructions(tx: any): Promise<void> {
    console.log("\n⚡ Instructions Analysis:");
    const message = tx.transaction.message;
    const instructions = message.instructions;

    instructions.forEach((ix: any, index: number) => {
      const programId = ix.programId;
      console.log(`   ${index + 1}. Program: ${programId}`);
      
      if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
        console.log(`     🎯 Token Program`);
      } else if (programId === '11111111111111111111111111111111') {
        console.log(`     🎯 System Program`);
      }
    });
  }

  private async analyzeTransactionResults(tx: any): Promise<void> {
    console.log("\n📊 Transaction Results:");
    
    if (tx.meta?.err) {
      console.log("   ❌ Transaction Failed:", tx.meta.err);
    } else {
      console.log("   ✅ Transaction Succeeded");
    }
    
    console.log(`   🔧 Compute Units: ${tx.meta?.computeUnitsConsumed || 'Unknown'}`);
  }

  private getAccountType(index: number, tx: any): string {
    const message = tx.transaction.message;
    const account = message.accountKeys[index];
    
    if (account.signer) {
      return account.writable ? '👤 Signer(W)' : '👤 Signer';
    } else if (account.writable) {
      return '💾 Writable';
    } else {
      return '📖 Readonly';
    }
  }
}

// ✨ استفاده جدید با دیتابیس
(async () => {
  const analyzer = new AdvancedTransactionAnalyzer();
  
  // روش ۱: خواندن همه signatures (پیشفرض)
  await analyzer.analyzeFromDatabase({
    limit: 10,
    complete: false
  });

  // روش ۲: خواندن با فیلترهای خاص
  await analyzer.analyzeFromDatabase({
    limit: 5,
    filters: {
      symbol: 'SOL', // فیلتر بر اساس نماد
      minSupply: BigInt(1000000), // حداقل supply
      dateRange: {
        start: new Date('2024-01-01'),
        end: new Date()
      }
    }
  });

  // روش ۳: فقط تراکنش‌های complete شده
  await analyzer.analyzeFromDatabase({
    limit: 15,
    complete: true
  });
})();