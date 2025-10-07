import { PrismaClient } from "../generated/prisma";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

async function getATH() {
  try {
    console.log("🚀 Calculating ATH and totals from BondingCurveSignature...\n");

    // دریافت تمام رکوردها
    const records = await prisma.bondingCurveSignature.findMany({
      where: {
        error: null, // رکوردهایی که خطا ندارند
      },
      select: {
        curveAddress: true,
        realSolReserves: true,
        blockTime: true,
        createdAt: true,
      },
    });

    if (records.length === 0) {
      console.log("⚠️ No records found.");
      return;
    }

    // ساخت Map برای گروه‌بندی بر اساس curveAddress
    const grouped = new Map<
      string,
      { reserves: number[]; times: { time: number | null; date: Date }[] }
    >();

    for (const record of records) {
      const solValue = parseFloat(record.realSolReserves);
      if (isNaN(solValue)) continue;

      if (!grouped.has(record.curveAddress)) {
        grouped.set(record.curveAddress, { reserves: [], times: [] });
      }
      grouped.get(record.curveAddress)!.reserves.push(solValue);
      grouped.get(record.curveAddress)!.times.push({
        time: record.blockTime,
        date: record.createdAt,
      });
    }

    // محاسبه ATH و مجموع برای هر curve
    const results = [];

    for (const [curve, data] of grouped.entries()) {
      const total = data.reserves.reduce((a, b) => a + b, 0);
      const max = Math.max(...data.reserves);
      const index = data.reserves.indexOf(max);
      const timeInfo = data.times[index];

      const dateTime = timeInfo.time
        ? DateTime.fromSeconds(timeInfo.time).toISO()
        : DateTime.fromJSDate(timeInfo.date).toISO();

      results.push({
        curveAddress: curve,
        ath: max,
        totalReserves: total,
        peakTime: dateTime,
      });
    }

    // مرتب‌سازی بر اساس ATH از بیشترین به کمترین
    results.sort((a, b) => b.ath - a.ath);

    // چاپ نتایج در کنسول
    console.log("📊 ATH Results:\n");
    for (const r of results) {
      console.log(`💎 Curve: ${r.curveAddress}`);
      console.log(`   • ATH (max realSolReserves): ${r.ath.toFixed(6)} SOL`);
      console.log(`   • Total realSolReserves: ${r.totalReserves.toFixed(6)} SOL`);
      console.log(`   • Peak Time: ${r.peakTime}`);
      console.log("---------------------------------------------------------");
    }
  } catch (error) {
    console.error("❌ Error calculating ATH:", error);
  } finally {
    await prisma.$disconnect();
  }
}

getATH();
