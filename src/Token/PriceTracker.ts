/*
  PriceTracker.ts

  محاسبهٔ متریک‌های قیمتی توکن (ATH, Low, میانگین ساعتی)
  - تلاش می‌کنه تاریخچهٔ قیمت رو از مدل‌های متداول دیتابیس بخونه (در صورت وجود)
  - اگر تاریخچه نبود، از رکورد اصلی `token` استفاده می‌کنه (فیلد Tokenprice به‌عنوان قیمت عرضه)
  - `Tokenprice` که به‌صورت رشته ذخیره شده رو به عدد تبدیل می‌کنه (پاک‌سازی کاراکترهای اضافی)
  - خروجی: لاگ ATH، پایین‌ترین قیمت، میانگین 1 ساعته (یا fallback به آخرین نمونه‌ها)

  نحوهٔ استفاده:
    import { trackPriceMetrics } from './path/to/PriceTracker';
    await trackPriceMetrics('MINT_OR_BONDINGCURVE_ADDRESS');

  توجه: این فایل سعی می‌کنه تغییری در فایل‌های اصلی پروژه وارد نکنه و با Prisma موجود هماهنگ باشه.
*/

import { PublicKey } from "@solana/web3.js";
import { PrismaClient } from "../generated/prisma";

type PriceEntry = {
  price: number;
  timestamp: Date;
  source?: string;
  raw?: any;
};

export interface TrackOptions {
  prisma?: PrismaClient; // می‌تونید PrismaClient خودتون رو پاس بدید تا از ایجاد کانکشن اضافی جلوگیری کنید
  lookbackHours?: number; // پیش‌فرض 1 ساعت
  minSamples?: number; // حداقل نمونه برای محاسبه میانگین (اگر نمونهٔ ساعتی نبود از آخرین N نمونه استفاده می‌کنه)
}
export async function GetTokenPrice(mint: string): Promise<void> {
 
    console.log(`⏳ Received bonding mint key: ${mint}. ds...`);

  
}
function normalizePriceString(s: unknown): number | null {
  if (s === null || s === undefined) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  let str = String(s).trim();
  if (!str) return null;

  // پاک‌سازی کاما، واحدها (مثل SOL) و هر چیزی به جز اعداد، نقطه، منفی و e/E
  // مثال‌ها: "0.000123", "2.81e-8", "1,234", "0.001234 SOL"
  str = str.replace(/,/g, "");
  // حذف واژگان و نمادهای غیر عددی ولی نگه‌داشتن e/E و - و .
  // ابتدا حذف SOL یا lamports و کلمات
  str = str.replace(/(SOL|sol|Lamports|lamports|LAMPORTS)/gi, "");
  // حذف هر کاراکتر غیر مجاز
  str = str.replace(/[^0-9eE+\-\.]/g, "");

  if (!str) return null;
  const n = Number.parseFloat(str);
  if (Number.isFinite(n)) return n;
  return null;
}

function extractPriceFromRow(row: any): number | null {
  if (!row || typeof row !== "object") return null;
  // احتمالات متداول برای نام ستون قیمت
  const priceKeys = [
    "price",
    "_price",
    "Tokenprice",
    "tokenPrice",
    "token_price",
    "value",
    "amount",
    "priceValue",
    "price_usd",
    "price_sol",
  ];

  for (const key of priceKeys) {
    if (key in row) {
      const p = normalizePriceString(row[key]);
      if (p !== null) return p;
    }
  }

  // اگر هیچکدوم نبود، تلاش می‌کنیم تمام فیلدهای رشته‌ای رو بگردیم و جایگاه محتمل رو پیدا کنیم
  for (const k of Object.keys(row)) {
    const val = row[k];
    if (typeof val === "string") {
      const p = normalizePriceString(val);
      if (p !== null) return p;
    }
    if (typeof val === "number") {
      // اگر عدد و معقول باشه (مثلاً 0 یا بیشتر و نه NaN)
      if (Number.isFinite(val) && val !== 0) return val;
    }
  }

  return null;
}

function extractTimestampFromRow(row: any): Date | null {
  if (!row || typeof row !== "object") return null;
  const tsKeys = ["timestamp", "createdAt", "created_at", "time", "date", "updatedAt", "updated_at", "blockTime"];
  for (const k of tsKeys) {
    if (k in row) {
      const v = row[k];
      if (v instanceof Date) return v;
      if (typeof v === "number") {
        // عدد احتمالاً timestamp ثانیه‌ای یا میلی‌ثانیه‌ای
        if (v > 1e12) return new Date(v); // ms
        return new Date(v * 1000); // s -> ms
      }
      if (typeof v === "string") {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  return null;
}

async function tryReadHistoryFromModel(
  prisma: PrismaClient,
  modelName: string,
  mintAddress: string
): Promise<PriceEntry[]> {
  const out: PriceEntry[] = [];
  const model = (prisma as any)[modelName];
  if (!model) return out;

  try {
    // تلاش برای خواندن حداکثر 2000 ردیف (برای اکثر تاریخچه‌ها کافی است)
    const rows = await model.findMany({ take: 2000 });

    for (const r of rows) {
      // بررسی اینکه رکورد مربوط به این mint باشه (هر کجا که آدرس وجود داره)
      const values = Object.values(r).map((v: any) => (v === null || v === undefined ? "" : String(v)));
      const containsMint = values.some((v: string) => v === mintAddress || v.includes(mintAddress));
      if (!containsMint) continue;

      const price = extractPriceFromRow(r);
      if (price === null) continue;

      const ts = extractTimestampFromRow(r) || new Date();
      out.push({ price, timestamp: ts, source: modelName, raw: r });
    }
  } catch (e) {
    // مدل وجود داره ولی دسترسی یا ساختار متفاوته — نادیده می‌گیریم
  }

  return out;
}

export async function trackPriceMetrics(
  mintAddress: string,
  options?: TrackOptions
): Promise<{
  ath?: PriceEntry;
  low?: PriceEntry;
  average1h?: number;
  samples: number;
}> {
  const lookbackHours = options?.lookbackHours ?? 1;
  const minSamples = options?.minSamples ?? 5;
  const prisma = options?.prisma ?? new PrismaClient();
  let createdLocalPrisma = !options?.prisma;

  try {
    const priceData: PriceEntry[] = [];

    // 1) تلاش برای مدل‌های تاریخچه متداول
    const candidateModels = [
      "tokenPriceHistory",
      "token_price_history",
      "TokenPriceHistory",
      "TokenPrices",
      "tokenPrices",
      "price_history",
      "PriceHistory",
      "priceHistory",
      "prices",
      "token_history",
      "token_historys",
    ];

    for (const m of candidateModels) {
      const rows = await tryReadHistoryFromModel(prisma, m, mintAddress);
      if (rows.length > 0) {
        priceData.push(...rows);
        // نیازی به چک بقیهٔ مدل‌ها نیست اگر تاریخچه پیدا شد
        break;
      }
    }

    // 2) اگر تاریخچه نبود → از رکورد اصلی token در دیتابیس استفاده کن
    if (priceData.length === 0) {
      try {
        const token = await (prisma as any).token.findUnique({ where: { mintAddress } });
        if (token) {
          const initialPrice = normalizePriceString(token.Tokenprice);
          if (initialPrice !== null && initialPrice !== 0) {
            const ts = token.timestamp || token.createdAt || new Date();
            priceData.push({ price: initialPrice, timestamp: ts, source: "token(Tokenprice)", raw: token });
          }
        }
      } catch (e) {
        // اگر جدول token ساختار متفاوتی داره هم نادیده می‌گیریم
      }
    }

    // 3) اگر هنوز دیتا نیست، خروجی مناسب میده
    if (priceData.length === 0) {
      console.log(`❌ هیچ دادهٔ قیمتی برای ${mintAddress} در دیتابیس پیدا نشد.`);
      return { samples: 0 };
    }

    // 4) مرتب‌سازی بر اساس زمان
    priceData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // 5) محاسبه ATH و LOW
    const ath = priceData.reduce((best, cur) => (cur.price > best.price ? cur : best), priceData[0]);
    const low = priceData.reduce((best, cur) => (cur.price < best.price ? cur : best), priceData[0]);

    // 6) میانگین ساعتی (lookbackHours)
    const now = new Date();
    const since = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
    const hourData = priceData.filter((p) => p.timestamp.getTime() >= since.getTime());

    let average1h: number | undefined;
    if (hourData.length >= 1) {
      average1h = hourData.reduce((s, p) => s + p.price, 0) / hourData.length;
    } else {
      // fallback: از آخرین minSamples نمونه استفاده کن
      const lastN = priceData.slice(-minSamples);
      average1h = lastN.reduce((s, p) => s + p.price, 0) / lastN.length;
    }
    function formatPrice(price: number): string {
  return `${(price).toFixed(9)} SOL`;
}

    // 7) خروجی و لاگ
    console.log(`\n📊 Price metrics for: ${mintAddress}`);
    console.log(`🟢 ATH: ${formatPrice(ath.price)} (at) [source: token(Tokenprice)]`);
    console.log(`🔴 LOW: ${formatPrice(low.price)} (at) [source: token(Tokenprice)]`);
    console.log(`   ⚖️ Average (last ${lookbackHours}h, fallback last ${minSamples}): ${average1h?.toFixed(10)}`);
    console.log(`   🧾 Samples used: ${priceData.length}\n`);

    return {
      ath,
      low,
      average1h,
      samples: priceData.length,
    };
  } finally {
    if (createdLocalPrisma) {
      await prisma.$disconnect();
    }
  }
}

// اگر مستقیم اجرا بشه یک نمونه ساده اجرا کن
if (require.main === module) {
  (async () => {
    const mint = process.argv[2];
    if (!mint) {
      console.log("Usage: node PriceTracker.js <MINT_ADDRESS>");
      process.exit(1);
    }

    await trackPriceMetrics(mint).catch((e) => console.error(e));
    process.exit(0);
  })();
}
