// fixed_balance_analysis.ts
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

async function fixedBalanceAnalysis(): Promise<void> {
  try {
    console.log("🔍 Analyzing balance changes...");

    const signatures = await prisma.bondingCurveSignature.findMany({
      orderBy: {
        blockTime: 'asc'
      }
    });

    if (signatures.length === 0) {
      console.log("❌ No transactions found");
      return;
    }

    const totalPostBalance = signatures.reduce((sum, sig) => sum + sig.postBalances, 0n);
    const totalPreBalance = signatures.reduce((sum, sig) => sum + sig.preBalances, 0n);
    const totalBalanceChange = totalPostBalance - totalPreBalance;

    const LAMPORTS_PER_SOL = 1_000_000_000;

    // محاسبه درصد با دقت بیشتر
    const growthPercentage = totalPreBalance !== 0n 
      ? Number((totalBalanceChange * 1000000000000n) / totalPreBalance) / 10000000000 // دقت بیشتر
      : totalBalanceChange > 0n ? 100 : 0;

    // نمایش نتایج
    console.log("\n📊 BALANCE ANALYSIS RESULTS");
    console.log("============================");
    console.log(`Total Transactions: ${signatures.length}`);
    console.log(`Total Pre-Balance: ${totalPreBalance.toString()} lamports`);
    console.log(`Total Pre-Balance: ${(Number(totalPreBalance) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`Total Post-Balance: ${totalPostBalance.toString()} lamports`);
    console.log(`Total Post-Balance: ${(Number(totalPostBalance) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`Total Balance Change: ${totalBalanceChange.toString()} lamports`);
    console.log(`Total Balance Change: ${(Number(totalBalanceChange) / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
    console.log(`Growth Percentage: ${growthPercentage.toFixed(10)}%`);
    console.log("============================\n");

    // نمایش جزئیات با زمان میلادی
    console.log("📋 TRANSACTION DETAILS:");
    signatures.forEach((sig, index) => {
      const change = sig.postBalances - sig.preBalances;
      
      // محاسبه درصد با دقت بیشتر برای هر تراکنش
      const changePercentage = sig.preBalances !== 0n 
        ? Number((change * 1000000000000n) / sig.preBalances) / 10000000000
        : change > 0n ? 100 : 0;
      
      // زمان میلادی
      const dateTime = sig.blockTime 
        ? new Date(sig.blockTime * 1000).toISOString()
        : 'N/A';

      console.log(`${index + 1}. ${sig.signature}`);
      console.log(`   Time: ${dateTime}`);
      console.log(`   Pre: ${sig.preBalances.toString()} lamports`);
      console.log(`   Post: ${sig.postBalances.toString()} lamports`);
      console.log(`   Change: ${change.toString()} lamports`);
      console.log(`   Change: ${(Number(change) / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
      console.log(`   Change %: ${changePercentage.toFixed(10)}%`);
      console.log("   ---");
    });

  } catch (error) {
    console.error('❌ Error in balance analysis:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// اجرای آنالیز
fixedBalanceAnalysis().catch(console.error);