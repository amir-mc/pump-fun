// gettotalcap.ts
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

interface MarketCapResult {
  signature: string;
  curveAddress: string;
  totalMarketCapSOL: number;
  totalMarketCapUSD: number;
  pricePerTokenSOL: number;
  pricePerTokenUSD: number;
  tokenTotalSupply: bigint;
  tokenSupplyStandard: number;
  timestamp: Date;
  transactionType: string;
  tokenVolume: number;
  athUSD?: number;
  atlUSD?: number;
  // برای شفافیت می‌ذاریم مقدار ATH/ATL بر حسب SOL هم وجود داشته باشه
  athSOL?: number;
  atlSOL?: number;
}

let SOL_TO_USD = 217; // fallback

export async function updateSolPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    const data = await res.json();
    if (data?.solana?.usd) {
      SOL_TO_USD = data.solana.usd;
    }
    console.log(`💰 SOL Price Updated: $${SOL_TO_USD}`);
    return SOL_TO_USD;
  } catch (e) {
    console.warn("⚠️ Failed to fetch SOL price, using fallback:", SOL_TO_USD);
    return SOL_TO_USD;
  }
}

/**
 * محاسبه مارکت کپ بر اساس رزروها (بدون استفاده از priceLamports/priceSol)
 * pricePerTokenSOL = (realSolReserves / LAMPORTS_PER_SOL) / (realTokenReserves / 1e9)
 */
function calculateMarketCapFromReserves(record: any): Omit<MarketCapResult, "athUSD" | "atlUSD" | "athSOL" | "atlSOL"> {
  // مقدار رزروها را به اعداد قابل محاسبه تبدیل می‌کنیم
  const realSolReserves_lamports = BigInt(record.realSolReserves ?? 0n);
  const realTokenReserves_raw = BigInt(record.realTokenReserves ?? 0n);

  let pricePerTokenSOL = 0;
  if (realTokenReserves_raw > 0n) {
    // pricePerTokenSOL = (realSolReserves_lamports / LAMPORTS_PER_SOL) / (realTokenReserves_raw / 1e9)
    // = (realSolReserves_lamports * 1e9) / (LAMPORTS_PER_SOL * realTokenReserves_raw)
    const numerator = Number(realSolReserves_lamports) * 1e9;
    const denominator = LAMPORTS_PER_SOL * Number(realTokenReserves_raw);
    pricePerTokenSOL = denominator > 0 ? numerator / denominator : 0;
  }

  const pricePerTokenUSD = pricePerTokenSOL * SOL_TO_USD;
  const tokenSupplyStandard = Number(record.tokenTotalSupply ?? 0n) / 1e9;
  const totalMarketCapSOL = pricePerTokenSOL * tokenSupplyStandard;
  const totalMarketCapUSD = totalMarketCapSOL * SOL_TO_USD;

  const tokenVolume = record.tokenDiff ? Math.abs(Number(record.tokenDiff)) / 1e9 : 0;
  const transactionType = record.tokenDiff && Number(record.tokenDiff) > 0 ? "BUY" : "SELL";

  return {
    signature: record.signature,
    curveAddress: record.curveAddress,
    totalMarketCapSOL,
    totalMarketCapUSD,
    pricePerTokenSOL,
    pricePerTokenUSD,
    tokenTotalSupply: record.tokenTotalSupply,
    tokenSupplyStandard,
    timestamp: record.createdAt,
    transactionType,
    tokenVolume,
  };
}

/**
 * محاسبه‌ی تاثیر یک tokenDiff بر روی realSolReserves و تبدیلش به SOL و USD.
 *
 * فرمول (با BigInt امن):
 * solFromTrade_SOL = ( tokenDiff_raw * realSolReserves_lamports ) / ( realTokenReserves_raw * LAMPORTS_PER_SOL )
 *
 * ورودی‌ها و خروجی‌ها:
 * - tokenDiff_raw, realTokenReserves_raw, realSolReserves_lamports ممکنه BigInt باشن
 * - خروجی: { solFromTrade_SOL, newRealSolReserves_SOL, newRealSolReserves_USD }
 */
function computeImpactAddTokenDiff(
  tokenDiff_raw: bigint,
  realTokenReserves_raw: bigint,
  realSolReserves_lamports: bigint
) {
  if (realTokenReserves_raw === 0n || realSolReserves_lamports === 0n || tokenDiff_raw === 0n) {
    const baseSol = Number(realSolReserves_lamports) / LAMPORTS_PER_SOL;
    return {
      solFromTrade_SOL: 0,
      newRealSolReserves_SOL: baseSol,
      newRealSolReserves_USD: baseSol * SOL_TO_USD,
    };
  }

  // solFromTrade_lamports (BigInt) = tokenDiff_raw * realSolReserves_lamports / realTokenReserves_raw
  // سپس solFromTrade_SOL = Number(solFromTrade_lamports) / LAMPORTS_PER_SOL
  const solFromTrade_lamports = (tokenDiff_raw * realSolReserves_lamports) / realTokenReserves_raw;

  const baseSol = Number(realSolReserves_lamports) / LAMPORTS_PER_SOL;
  const solFromTrade_SOL = Number(solFromTrade_lamports) / LAMPORTS_PER_SOL;
  const newRealSolReserves_SOL = baseSol + solFromTrade_SOL;
  const newRealSolReserves_USD = newRealSolReserves_SOL * SOL_TO_USD;

  return {
    solFromTrade_SOL,
    newRealSolReserves_SOL,
    newRealSolReserves_USD,
  };
}

/**
 * گرفتن آخرین مارکت کپ برای هر curveAddress و محاسبه ATH/ATL
 * بر اساس منطق: برای هر رکورد تاریخی، مقدار tokenDiff را "تبدیل به SOL"
 * کرده، به realSolReserves اضافه می‌کنیم و مقدار جدید را ثبت می‌کنیم.
 */
export async function getAllUniqueCurveMarketCaps(): Promise<MarketCapResult[]> {
  try {
    await updateSolPrice();

    const latestGroups = await prisma.bondingCurveSignature.groupBy({
      by: ["curveAddress"],
      _max: { createdAt: true },
    });

    const results: MarketCapResult[] = [];
    console.log(`🎯 Found ${latestGroups.length} unique curve addresses`);

    for (const g of latestGroups) {
      const curveAddress = g.curveAddress;

      // آخرین رکورد برای نمایشِ فعلی
      const latestRecord = await prisma.bondingCurveSignature.findFirst({
        where: {
          curveAddress,
          createdAt: g._max.createdAt!,
        },
        select: {
          signature: true,
          curveAddress: true,
          realTokenReserves: true,
          realSolReserves: true,
          tokenTotalSupply: true,
          tokenDiff: true,
          createdAt: true,
        },
      });
      if (!latestRecord) continue;

      // گرفتن همهٔ رکوردها برای این curve (برای محاسبه ATH/ATL بر اساس روش جدید)
      const allRecords = await prisma.bondingCurveSignature.findMany({
        where: { curveAddress },
        select: {
          signature: true,
          tokenDiff: true,
          realTokenReserves: true,
          realSolReserves: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" }, // ترتیب زمانی (در صورت تمایل)
      });

      // محاسبهٔ همهٔ newRealSolReserves_USD برای هر رکورد با فرمول گفته‌شده
      const newReservesUSDs: { sig: string; newSOL: number; newUSD: number; ts: Date }[] = [];

      for (const r of allRecords) {
        const tokenDiff_raw = r.tokenDiff ?? 0n;
        const realTokenReserves_raw = r.realTokenReserves ?? 0n;
        const realSolReserves_lamports = r.realSolReserves ?? 0n;

        const { newRealSolReserves_SOL, newRealSolReserves_USD } = computeImpactAddTokenDiff(
          BigInt(tokenDiff_raw),
          BigInt(realTokenReserves_raw),
          BigInt(realSolReserves_lamports)
        );

        newReservesUSDs.push({
          sig: r.signature ?? "<unknown>",
          newSOL: newRealSolReserves_SOL,
          newUSD: newRealSolReserves_USD,
          ts: r.createdAt ?? new Date(0),
        });
      }

      // حالا ATH و ATL بر اساس newRealSolReserves_USD
      const usdValues = newReservesUSDs.map(x => x.newUSD).filter(v => isFinite(v));
      const athUSD = usdValues.length ? Math.max(...usdValues) : 0;
      const atlUSD = usdValues.length ? Math.min(...usdValues) : 0;
      const athSOL = athUSD / SOL_TO_USD;
      const atlSOL = atlUSD / SOL_TO_USD;

      // محاسبه مارکت کپ فعلی از آخرین رکورد
      const baseMarket = calculateMarketCapFromReserves(latestRecord);

      results.push({
        ...baseMarket,
        athUSD,
        atlUSD,
        athSOL,
        atlSOL,
      });

      console.log(`\n📊 ${curveAddress}`);
      console.log(`   Current Market Cap: $${baseMarket.totalMarketCapUSD.toLocaleString()} (${baseMarket.totalMarketCapSOL.toFixed(6)} SOL)`);
      console.log(`   ATH (by tokenDiff→added SOL): $${athUSD.toLocaleString()} (${athSOL.toFixed(6)} SOL)`);
      console.log(`   ATL (by tokenDiff→added SOL): $${atlUSD.toLocaleString()} (${atlSOL.toFixed(6)} SOL)`);
      console.log(`   Price (token): $${baseMarket.pricePerTokenUSD.toExponential(6)} | Supply: ${baseMarket.tokenSupplyStandard.toLocaleString()}`);
      console.log("   " + "-".repeat(60));
    }

    // مرتب‌سازی بر اساس مارکت کپ فعلی
    results.sort((a, b) => b.totalMarketCapUSD - a.totalMarketCapUSD);

    console.log(`\n✅ TOTAL UNIQUE CURVES: ${results.length}`);
    return results;
  } catch (error) {
    console.error("❌ Error in getAllUniqueCurveMarketCaps:", error);
    return [];
  } finally {
    // دقت کن: اگر این تابع در اپ اصلی استفاده می‌شه، ممکنه نخواهی disconnect کنی
    // await prisma.$disconnect();
  }
}

// اجرای مستقیم برای تست
if (require.main === module) {
  getAllUniqueCurveMarketCaps().then(r => {
    console.log("\nDone.");
    // process.exit(0);
  }).catch(console.error);
}
