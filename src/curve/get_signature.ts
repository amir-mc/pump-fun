import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma";
import { BondingCurveStateProps } from "./get_bonding_curve_status";

dotenv.config();

const prisma = new PrismaClient();
const RPC_ENDPOINT = process.env.SOLANA_NODE_RPC_ENDPOINT || clusterApiUrl("mainnet-beta");
const TOKEN_DECIMALS = 9;

export async function getAndSaveSignaturesForCurve(
  curveAddress: string,
  curveState: BondingCurveStateProps
): Promise<void> {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const curvePubKey = new PublicKey(curveAddress);

  try {
    const signatures = await connection.getSignaturesForAddress(curvePubKey, { limit: 50 });
    console.log(`📝 Found ${signatures.length} signatures for curve ${curveAddress}`);

    for (const sig of signatures) {
      try {
        if (sig.err) {
          console.log(`⚠️ Skipping errored tx: ${sig.signature}`);
          continue;
        }

        const tx = await connection.getTransaction(sig.signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });

        if (!tx?.meta || !tx.transaction) continue;

        const preTokenBalances = tx.meta?.preTokenBalances ?? [];
        const postTokenBalances = tx.meta?.postTokenBalances ?? [];

        // نمایش مقادیر خام برای بررسی
        //console.log("PRE amounts:", preTokenBalances.map(b => b.uiTokenAmount.amount));
        //console.log("POST amounts:", postTokenBalances.map(b => b.uiTokenAmount.amount));

        // فیلتر فقط آدرس‌های مرتبط با curveAddress
        const pre = preTokenBalances.find(b => b.owner === curveAddress);
        const post = postTokenBalances.find(b => b.owner === curveAddress);
        if (!pre || !post) continue;

        const preAmount = BigInt(pre.uiTokenAmount.amount);
        const postAmount = BigInt(post.uiTokenAmount.amount);

        // اختلاف مقدار توکن
        const diff = postAmount - preAmount;

        // نادیده گرفتن تراکنش‌های بی‌معنی مثل مقدار 1
        if (diff === 1n || diff === 0n) continue;

        // ذخیره در پایگاه داده
        await prisma.bondingCurveSignature.upsert({
          where: { signature: sig.signature },
          update: {
            blockTime: sig.blockTime,
            confirmationStatus: sig.confirmationStatus || "finalized",
            preTokenAmount: preAmount,
            postTokenAmount: postAmount,
            tokenDiff: diff,
            virtualTokenReserves: curveState.virtual_token_reserves,
            virtualSolReserves: curveState.virtual_sol_reserves,
            realTokenReserves: curveState.real_token_reserves,
            realSolReserves: curveState.real_sol_reserves,
            tokenTotalSupply: curveState.token_total_supply,
            complete: curveState.complete,
            creator: curveState.creator?.toBase58() || null,
          },
          create: {
            signature: sig.signature,
            curveAddress,
            slot: sig.slot,
            blockTime: sig.blockTime,
            confirmationStatus: sig.confirmationStatus || "finalized",
            preTokenAmount: preAmount,
            postTokenAmount: postAmount,
            tokenDiff: diff,
            virtualTokenReserves: curveState.virtual_token_reserves,
            virtualSolReserves: curveState.virtual_sol_reserves,
            realTokenReserves: curveState.real_token_reserves,
            realSolReserves: curveState.real_sol_reserves,
            tokenTotalSupply: curveState.token_total_supply,
            complete: curveState.complete,
            creator: curveState.creator?.toBase58() || null,
          },
        });

        console.log(`💾 Saved Token Change: ${sig.signature} → Δ ${diff}`);
      } catch (txErr) {
        console.error(`⚠️ Error processing tx ${sig.signature}:`, txErr);
      }
    }

    console.log(`✅ All token changes for curve ${curveAddress} processed.`);
  } catch (error: any) {
    console.error(`❌ Error fetching/saving signatures: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}
