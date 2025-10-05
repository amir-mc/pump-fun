//pump-listener.ts
import { Connection, clusterApiUrl, PublicKey, ParsedTransactionWithMeta } from "@solana/web3.js";
import { TokenInfo, TokenSelect } from "../types";
import { PrismaClient } from "../generated/prisma";

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

class TransactionWorker {
  private connection: Connection;
  private prisma: PrismaClient;
  private queue: string[] = [];
  private isProcessing: boolean = false;
  private processingRate: number = 2000; // 2 ثانیه بین هر پردازش
  private retryCount: number = 0;
  private maxRetries: number = 3;

  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_NODE_RPC_ENDPOINT || clusterApiUrl("mainnet-beta"),
      "confirmed"
    );
    this.prisma = new PrismaClient();
  }

  // راه‌اندازی کل فرآیند
  public async start(): Promise<void> {
    console.log("🚀 Starting transaction worker...");
    await this.loadFromDatabase({
      limit: 50,
      complete: false,
      withPriceOnly: true,
      recent: true
    });
  }

  // اضافه کردن signature به صف
  public async addToQueue(signature: string): Promise<void> {
    this.queue.push(signature);
    console.log(`📥 Added to queue: ${signature.substring(0, 20)}... (Queue size: ${this.queue.length})`);
    
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  // اضافه کردن چندین signature به صف
  public async addBatchToQueue(signatures: string[]): Promise<void> {
    this.queue.push(...signatures);
    console.log(`📦 Added ${signatures.length} signatures to queue. Total: ${this.queue.length}`);
    
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  // پردازش صف به صورت ترتیبی
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log('🚀 Starting queue processing...');
    
    while (this.queue.length > 0) {
      const signature = this.queue.shift()!;
      console.log(`🔍 Processing: ${signature.substring(0, 20)}... | Remaining: ${this.queue.length}`);

      try {
        await this.processSignature(signature);
        this.retryCount = 0; // reset retry after success
      } catch (error: any) {
        console.error(`❌ Error processing ${signature}:`, error.message);

        // هندل محدودیت درخواست‌ها (429)
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          this.retryCount++;
          
          if (this.retryCount <= this.maxRetries) {
            const waitTime = Math.min(5000 * this.retryCount, 30000);
            console.log(`⚠️ Rate limit detected. Waiting ${waitTime / 1000}s before retry...`);
            await this.delay(waitTime);
            this.queue.unshift(signature); // اضافه کردن مجدد به ابتدای صف
          } else {
            console.log(`❌ Max retries exceeded for ${signature}`);
          }
        } else {
          console.error(`❌ Non-retryable error for ${signature}`);
        }
      }

      // تاخیر بین پردازش‌ها
      if (this.queue.length > 0) {
        await this.delay(this.processingRate);
      }
    }
    
    this.isProcessing = false;
    console.log('✅ Queue processing completed.');
  }

  // پردازش هر signature
  private async processSignature(signature: string): Promise<void> {
    // بررسی وجود قیمت در دیتابیس
    const hasPrice = await this.hasTokenPrice(signature);
    if (!hasPrice) {
      console.log(`⏭️ Skipping - No token price found`);
      return;
    }

    // دریافت اطلاعات تراکنش
    const tx = await this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!tx) {
      console.error("❌ Transaction not found!");
      return;
    }

    // نمایش اطلاعات
    await this.displayTokenInfo(signature);
    console.log("Block Time:", tx.blockTime ? new Date(tx.blockTime * 1000) : "Unknown");
    console.log("Slot:", tx.slot);
    console.log("Fee:", tx.meta?.fee ? `${tx.meta.fee / 1e9} SOL` : "Unknown");

    await this.analyzeSOLChanges(tx);
    await this.analyzeTokenChanges(tx);
    await this.analyzeInstructions(tx);
    
    // ذخیره اطلاعات پردازش شده
    await this.saveProcessedTransaction(signature, tx);
    
    console.log("✅ Processing completed successfully");
  }

  // تابع برای لود کردن خودکار از دیتابیس
  public async loadFromDatabase(options?: {
    limit?: number;
    complete?: boolean;
    recent?: boolean;
    withPriceOnly?: boolean;
  }): Promise<void> {
    try {
      const signatures = await this.getSignaturesFromDatabase(options);
      
      if (signatures.length === 0) {
        console.log('❌ No signatures found in database');
        return;
      }

      console.log(`📥 Loading ${signatures.length} signatures from database to queue`);
      await this.addBatchToQueue(signatures);

    } catch (error) {
      console.error('❌ Error loading from database:', error);
    }
  }

  // ذخیره تراکنش پردازش شده
 private async saveProcessedTransaction(signature: string, tx: ParsedTransactionWithMeta): Promise<void> {
  try {
    const logs = tx.meta?.logMessages || [];
    const buyer = tx.transaction.message.accountKeys[0]?.pubkey.toString() || 'Unknown';

    // ذخیره در یک جدول موقت یا استفاده از روش جایگزین
    console.log(`💾 Would save transaction data for: ${signature.substring(0, 20)}...`);
    console.log(`   Buyer: ${buyer}, Logs: ${logs.length}, Slot: ${tx.slot}, Fee: ${tx.meta?.fee}`);
    
    // یا ذخیره در فایل
    // await this.saveToFile(signature, { buyer, logCount: logs.length, slot: tx.slot });
    
  } catch (error) {
    console.error('❌ Error processing transaction data:', error);
  }
}

  // متدهای کمکی
  private async hasTokenPrice(signature: string): Promise<boolean> {
    try {
      const token = await this.prisma.token.findFirst({
        where: {
          signature: signature,
          Tokenprice: {
            not: "0"
          }
        },
        select: {
          Tokenprice: true
        }
      });
      return !!token?.Tokenprice;
    } catch (error) {
      console.error("❌ Error checking token price:", error);
      return false;
    }
  }

  private async getSignaturesFromDatabase(options?: {
    limit?: number;
    complete?: boolean;
    recent?: boolean;
    withPriceOnly?: boolean;
  }): Promise<string[]> {
    try {
      const {
        limit = 50,
        complete = false,
        recent = true,
        withPriceOnly = true
      } = options || {};

      const whereClause: any = { complete: complete };

      if (withPriceOnly) {
        whereClause.Tokenprice = { not: "0" };
      }

      const tokens = await this.prisma.token.findMany({
        where: whereClause,
        orderBy: recent ? { timestamp: 'desc' } : { timestamp: 'asc' },
        take: limit,
        select: {
          signature: true,
          symbol: true,
          name: true
        }
      });

      console.log(`✅ Found ${tokens.length} tokens in database`);
      
      tokens.forEach((token, index) => {
        console.log(`   ${index + 1}. ${token.symbol} - ${token.name}`);
      });

      return tokens.map((token) => token.signature);

    } catch (error) {
      console.error('❌ Error fetching signatures from database:', error);
      return [];
    }
  }
  private async displayTokenInfo(signature: string): Promise<void> {
    try {
      const token = await this.prisma.token.findFirst({
        where: { signature: signature },
        select: {
          name: true,
          symbol: true,
          Tokenprice: true
        }
      });
      
      if (token) {
        console.log(`Name: ${token.name}`);
        console.log(`Symbol: ${token.symbol}`);
        console.log(`Price: ${token.Tokenprice} ✅`);
      } else {
        console.log("❌ Token not found in database");
      }
    } catch (error) {
      console.error("❌ Error fetching token info:", error);
    }
  }

  private async analyzeSOLChanges(tx: ParsedTransactionWithMeta): Promise<void> {
    console.log("\n💰 SOL Balance Changes:");
    let totalSOLChange = 0;
    
    tx.meta?.postBalances?.forEach((balance: number, i: number) => {
      const pre = tx.meta?.preBalances?.[i] ?? 0;
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

  private async analyzeInstructions(tx: ParsedTransactionWithMeta): Promise<void> {
    console.log("\n⚡ Instructions Analysis:");
    const message = tx.transaction.message;
    const instructions = message.instructions;

    instructions.forEach((ix: any, index: number) => {
      const programId = ix.programId;
      console.log(`   ${index + 1}. Program: ${programId}`);
    });
  }

  private getAccountType(index: number, tx: ParsedTransactionWithMeta): string {
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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // متدهای مدیریت صف
  public getQueueSize(): number {
    return this.queue.length;
  }

  public isWorkerProcessing(): boolean {
    return this.isProcessing;
  }

  public clearQueue(): void {
    this.queue = [];
    console.log('🧹 Queue cleared');
  }

  // بستن اتصالات
  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// اجرای اصلی
(async () => {
  const worker = new TransactionWorker();

  try {
    await worker.start();
  } catch (error) {
    console.error('❌ Error in main execution:', error);
  } finally {
    await worker.disconnect();
  }
})();