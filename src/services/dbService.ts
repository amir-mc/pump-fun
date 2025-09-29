import { PrismaClient } from "../generated/prisma";
import { BondingCurveStateProps } from "../curve/get_bonding_curve_status";

const prisma = new PrismaClient();

export async function saveBondingCurveTest(
  curveAddr: string,
  bondingCurveState: BondingCurveStateProps
) {
  try {
    const saved = await prisma.bondingCurveTest.create({
      data: {
        curveAddr,
        Tokenprice: Number(bondingCurveState.virtual_sol_reserves) / 1e9,
        virtual_token_reserves: bondingCurveState.virtual_token_reserves,
        virtual_sol_reserves: bondingCurveState.virtual_sol_reserves,
        real_token_reserves: bondingCurveState.real_token_reserves,
        real_sol_reserves: bondingCurveState.real_sol_reserves,
        token_total_supply: bondingCurveState.token_total_supply,
        complete: bondingCurveState.complete,
        creator: bondingCurveState.creator?.toBase58() || null,
      },
    });
    console.log("✅ BondingCurveTest saved:", saved.id);
  } catch (error: any) {
    console.error("❌ Error saving bonding curve test:", error.message);
  }
}
