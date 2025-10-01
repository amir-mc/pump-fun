
import { Connection, clusterApiUrl, PublicKey } from "@solana/web3.js";



export async function GetTokenCurve(params:any) {
  console.log('es')
}


class AdvancedTransactionAnalyzer {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
  }

  public async analyze(signature: string): Promise<void> {
    console.log(`🔎 Analyzing signature: ${signature}`);

    // استفاده از getParsedTransaction مانند کد دوم
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

    // 1. تحلیل تغییرات SOL (مانند کد اول اما پیشرفته‌تر)
    await this.analyzeSOLChanges(tx);

    // 2. تحلیل تغییرات توکن‌های SPL (مانند کد دوم)
    await this.analyzeTokenChanges(tx);

    // 3. تحلیل برنامه‌ها و دستورالعمل‌ها
    await this.analyzeInstructions(tx);

    // 4. تحلیل نتایج تراکنش
    await this.analyzeTransactionResults(tx);
  }

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
        console.log(
          `   ${accountType} ${i}: ${diff > 0 ? '📈 +' : '📉 '}${solAmount.toFixed(6)} SOL`
        );
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
            console.log(
              `   ${change > 0 ? '🟢 +' : '🔴 '}${change.toLocaleString()} ${symbol}`
            );
            
            console.log('perSOL:',symbol* 1e9)
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
      
      // تحلیل برنامه‌های معروف
      if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
        console.log(`     🎯 Token Program`);
      } else if (programId === '11111111111111111111111111111111') {
        console.log(`     🎯 System Program`);
      } else if (programId === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') {
        console.log(`     🎯 Associated Token Account`);
      }
    });
  }

  private async analyzeTransactionResults(tx: any): Promise<void> {
    console.log("\n📊 Transaction Results:");

    // وضعیت تراکنش
    if (tx.meta?.err) {
      console.log("   ❌ Transaction Failed:", tx.meta.err);
    } else {
      console.log("   ✅ Transaction Succeeded");
    }

    // مصرف منابع
    console.log(`   🔧 Compute Units: ${tx.meta?.computeUnitsConsumed || 'Unknown'}`);
    
    // تغییرات فضای حساب
    if (tx.meta?.postBalances.length !== tx.meta?.preBalances.length) {
      console.log("   🆕 New Accounts Created");
    }
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

// ✨ استفاده پیشرفته
(async () => {
  const analyzer = new AdvancedTransactionAnalyzer();
  
  // تحلیل چندین تراکنش نمونه
  const signatures = [
    "3FWeMgoAG7jj5yYoTCYaMeAHJ9K976ZtC4AZLHH6x7B9ZD4BkiPa61ALYX6kvLXNyh1s5hpNh8AmguYnfoAgbJN7",
    // می‌توانید signatureهای بیشتری اضافه کنید
  ];

  for (const signature of signatures) {
    await analyzer.analyze(signature);
    console.log("\n" + "=".repeat(50) + "\n");
  }
})();