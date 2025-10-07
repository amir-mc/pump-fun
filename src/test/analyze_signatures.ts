import { PrismaClient } from "../generated/prisma";
//from curve to wallet
const prisma = new PrismaClient();

async function analyzeMarketCap() {
  console.log("🚀 شروع تحلیل Market Cap...\n");

  const signatures = await prisma.bondingCurveSignature.findMany({
    where: {
      curveAddress: "A4mfqtbZQgbRrad9WtJQeRqkBZG3gVjiUApag9ysWByJ"
    },
    select: {
      id: true,
      signature: true,
      curveAddress: true,
      virtualTokenReserves: true,
      virtualSolReserves: true,
      realTokenReserves: true,
      realSolReserves: true,
      tokenTotalSupply: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (signatures.length === 0) {
    console.log("⚠️ هیچ داده‌ای برای این curve وجود ندارد.");
    return;
  }

  console.log(`📊 تعداد رکوردها: ${signatures.length}\n`);

  const marketCaps: number[] = [];
  const prices: number[] = [];

  for (const sig of signatures) {
    // تبدیل به عدد
    const realSolReserves = Number(sig.realSolReserves);
    const realTokenReserves = Number(sig.realTokenReserves);
    const tokenTotalSupply = Number(sig.tokenTotalSupply);

    // محاسبه قیمت (SOL per token)
    const price = realSolReserves / realTokenReserves;
    
    // محاسبه Market Cap صحیح برای pump.fun
    const marketCap = realSolReserves * 2; // این مقدار بر حسب lamports است
    
    // تبدیل به SOL
    const marketCapSOL = marketCap / 1e9;
    const priceSOL = price;

    marketCaps.push(marketCapSOL);
    prices.push(priceSOL);

    console.log(`🕓 ${sig.createdAt.toISOString()}`);
    console.log(`   💰 Real SOL: ${(realSolReserves / 1e9).toFixed(9)} SOL`);
    console.log(`   🪙 Real Token: ${(realTokenReserves / 1e9).toFixed(9)} Tokens`);
    console.log(`   💵 Price: $${(priceSOL * 170).toFixed(8)} | ${priceSOL.toExponential(6)} SOL`);
    console.log(`   📊 Market Cap: $${(marketCapSOL * 170).toFixed(2)} | ${marketCapSOL.toFixed(6)} SOL`);
    console.log(`   🔗 Signature: ${sig.signature.substring(0, 20)}...\n`);
  }

  if (marketCaps.length === 0) {
    console.log("⚠️ هیچ مقدار معتبری برای تحلیل وجود ندارد.");
    return;
  }

  // محاسبه آمارها
  const minMarketCap = Math.min(...marketCaps);
  const maxMarketCap = Math.max(...marketCaps);
  const firstMarketCap = marketCaps[0];
  const lastMarketCap = marketCaps[marketCaps.length - 1];
  const changePercent = ((lastMarketCap - firstMarketCap) / firstMarketCap) * 100;

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const priceChangePercent = ((lastPrice - firstPrice) / firstPrice) * 100;

  // فرض: قیمت SOL = $230
  const solPriceUSD = 230;

  console.log("\n📈 تحلیل نهایی Market Cap (بر اساس SOL = $" + solPriceUSD + "):");
  console.log(`- کمترین Market Cap: $${(minMarketCap * solPriceUSD).toFixed(2)} | ${minMarketCap.toFixed(6)} SOL`);
  console.log(`- بیشترین Market Cap: $${(maxMarketCap * solPriceUSD).toFixed(2)} | ${maxMarketCap.toFixed(6)} SOL`);
  console.log(`- Market Cap اولیه: $${(firstMarketCap * solPriceUSD).toFixed(2)} | ${firstMarketCap.toFixed(6)} SOL`);
  console.log(`- Market Cap نهایی: $${(lastMarketCap * solPriceUSD).toFixed(2)} | ${lastMarketCap.toFixed(6)} SOL`);
  console.log(`- درصد تغییر Market Cap: ${changePercent.toFixed(2)}%`);

  console.log("\n💰 تحلیل قیمت:");
  console.log(`- کمترین قیمت: $${(minPrice * solPriceUSD).toFixed(8)} | ${minPrice.toExponential(6)} SOL`);
  console.log(`- بیشترین قیمت: $${(maxPrice * solPriceUSD).toFixed(8)} | ${maxPrice.toExponential(6)} SOL`);
  console.log(`- قیمت اولیه: $${(firstPrice * solPriceUSD).toFixed(8)} | ${firstPrice.toExponential(6)} SOL`);
  console.log(`- قیمت نهایی: $${(lastPrice * solPriceUSD).toFixed(8)} | ${lastPrice.toExponential(6)} SOL`);
  console.log(`- درصد تغییر قیمت: ${priceChangePercent.toFixed(2)}%`);
}

analyzeMarketCap()
  .then(() => {
    console.log("\n✅ تحلیل Market Cap کامل شد.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ خطا در تحلیل:", err);
    process.exit(1);
  });