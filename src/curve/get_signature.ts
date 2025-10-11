import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma";
import { BondingCurveStateProps } from "./get_bonding_curve_status";


dotenv.config();

const prisma = new PrismaClient();
const RPC_ENDPOINT = process.env.SOLANA_NODE_RPC_ENDPOINT || clusterApiUrl("mainnet-beta");

const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_DECIMALS = 9;

/**
 * گرفتن تراکنش‌های اخیر (signature) برای یک bonding curve مشخص
 * و ذخیره فقط تراکنش‌هایی که curve → user ارسال توکن کرده (BUY)
 */
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

        const accountKeys = tx.transaction.message.getAccountKeys().staticAccountKeys.map(k => k.toBase58());
        const curveIndex = accountKeys.indexOf(curveAddress);
        if (curveIndex === -1) continue;

        const preBalances = tx.meta.preBalances || [];
        const postBalances = tx.meta.postBalances || [];
        const curvePreBalance = BigInt(preBalances[curveIndex] || 0);
        const curvePostBalance = BigInt(postBalances[curveIndex] || 0);
        const solChange = curvePostBalance - curvePreBalance;

        const preTokenBalances = tx.meta.preTokenBalances || [];
        const postTokenBalances = tx.meta.postTokenBalances || [];
        const curveTokenBefore = preTokenBalances.find(b => b.owner === curveAddress);
        const curveTokenAfter = postTokenBalances.find(b => b.owner === curveAddress);

        if (!curveTokenBefore || !curveTokenAfter) continue;

        const beforeAmount = BigInt(curveTokenBefore.uiTokenAmount.amount);
        const afterAmount = BigInt(curveTokenAfter.uiTokenAmount.amount);
        const tokenSentOut = beforeAmount - afterAmount;

        if (tokenSentOut <= 0n) continue; // فقط BUY ها

        const tokenAmountInStandard = Number(tokenSentOut) / Math.pow(10, TOKEN_DECIMALS);
        const solAmountInStandard = Number(solChange) / LAMPORTS_PER_SOL;
        const priceSol = solAmountInStandard / tokenAmountInStandard;
        const priceLamports = BigInt(Math.floor(priceSol * LAMPORTS_PER_SOL));

        await prisma.bondingCurveSignature.upsert({
          where: { signature: sig.signature },
          update: {
            slot: sig.slot,
            blockTime: sig.blockTime,
            confirmationStatus: sig.confirmationStatus || "finalized",
            memo: sig.memo,
            preBalances: curvePreBalance,
            postBalances: curvePostBalance,
            tokenSentOut,
            priceLamports,
            priceSol: priceSol.toString(),
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
            error: null,
            memo: sig.memo,
            virtualTokenReserves: curveState.virtual_token_reserves,
            virtualSolReserves: curveState.virtual_sol_reserves,
            realTokenReserves: curveState.real_token_reserves,
            realSolReserves: curveState.real_sol_reserves,
            tokenTotalSupply: curveState.token_total_supply,
            complete: curveState.complete,
            creator: curveState.creator?.toBase58() || null,
            preBalances: curvePreBalance,
            postBalances: curvePostBalance,
            tokenSentOut,
            priceLamports,
            priceSol: priceSol.toString(),
          },
        });

        console.log(`💾 Saved BUY transaction: ${sig.signature}`);
      } catch (txErr) {
        console.error(`⚠️ Error processing tx ${sig.signature}:`, txErr);
      }
    }

    console.log(`✅ All BUY signatures for curve ${curveAddress} processed.`);
  } catch (error: any) {
    console.error(`❌ Error fetching/saving signatures: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}
