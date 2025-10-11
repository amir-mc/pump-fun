// getAth.ts
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

const LAMPORTS_PER_SOL = 1_000_000_000n;
const TOKEN_DECIMALS = 6n;

function lamportsToSol(l: bigint) {
  return Number(l) / Number(LAMPORTS_PER_SOL);
}

export async function getAth(curveAddress?: string) {
  try {
    const where = curveAddress ? { curveAddress } : {};
    const rows = await prisma.bondingCurveSignature.findMany({
      where,
      orderBy: { blockTime: "asc" },
      // select fields that might exist:
      select: {
        id: true,
        signature: true,
        blockTime: true,
        preBalances: true,
        postBalances: true,
        virtualSolReserves: true,
        virtualTokenReserves: true,
        realSolReserves: true,
        // اگر فیلدهای جدید را اضافه کردی:
        // tokenSentOut: true,
        // priceLamports: true,
        // priceSol: true,
      } as any,
    });

    if (!rows || rows.length === 0) {
      console.log("⚠️ No rows found.");
      return;
    }

    type RowPrice = {
      signature: string;
      blockTime: number | null;
      priceSol: number;
      method: string;
    };

    const priceList: RowPrice[] = [];

    for (const r of rows) {
      // 1) اگر priceLamports/priceSol رو در DB ذخیره کردی از اون استفاده کن (اولویت)
      // (در این select فعلاً این فیلد نیست؛ اگر اضافه کردی، اول اون رو بررسی کن)

      // 2) اگر tokenSentOut موجود باشه (و pre/post ذخیره شده باشه) => محاسبه‌ی price از تراکنش
      try {
        const pre = (r.preBalances !== null && r.preBalances !== undefined) ? BigInt(r.preBalances) : null;
        const post = (r.postBalances !== null && r.postBalances !== undefined) ? BigInt(r.postBalances) : null;

        if (pre !== null && post !== null) {
          // فرض: pre/post مربوط به curve account هستند (از getAndSaveSignatures اصلاح‌شده)
          const solDiff = post - pre; // lamports
          // اما ما نیاز به tokenSentOut داریم؛ اگر در DB ذخیره‌شده از آن استفاده کن. 
          // در غیر اینصورت fallback به استفاده از virtual reserves برای تخمین قیمت:
          // -> برای حالا: اگر tokenSentOut نداریم، از virtual reserves استفاده می‌کنیم.
        }

        // fallback: use virtual reserves if present
        if (r.virtualSolReserves && r.virtualTokenReserves) {
          const vs = BigInt(r.virtualSolReserves);
          const vt = BigInt(r.virtualTokenReserves);

          if (vs > 0n && vt > 0n) {
            const virtualSol = Number(vs) / 1e9;
            const virtualTokens = Number(vt) / Math.pow(10, Number(TOKEN_DECIMALS));
            const priceSol = virtualSol / virtualTokens;
            priceList.push({
              signature: r.signature,
              blockTime: r.blockTime,
              priceSol,
              method: "virtual-reserves-fallback",
            });
            continue;
          }
        }
      } catch (e) {
        // ignore row if can't compute
      }
    }

    if (priceList.length === 0) {
      console.log("⚠️ No computable prices found (add tokenSentOut/price to DB to compute exact swap prices).");
      return;
    }

    // initial price = first available price
    const initial = priceList[0];
    let ath = priceList[0];
    for (const p of priceList) {
      if (p.priceSol > ath.priceSol) ath = p;
    }

    const percentGain = ((ath.priceSol - initial.priceSol) / initial.priceSol) * 100;
    const athDate = ath.blockTime ? new Date(ath.blockTime * 1000).toLocaleString() : "unknown";

    console.log("📈 ATH Results:");
    console.log(`  Initial price (${initial.method}) = ${initial.priceSol} SOL`);
    console.log(`  ATH price (${ath.method}) = ${ath.priceSol} SOL`);
    console.log(`  Growth: +${percentGain.toFixed(2)}%`);
    console.log(`  ATH time: ${athDate}`);
  } catch (err: any) {
    console.error("❌ getAth error:", err.message ?? err);
  } finally {
    await prisma.$disconnect();
  }
}

// run directly:
if (require.main === module) {
  const addr = process.argv[2]; // optional: pass curve address as arg
  getAth(addr);
}
