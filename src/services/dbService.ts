//dbService.ts
import { BondingCurveStateProps, calculateBondingCurvePrice } from "../curve/get_bonding_curve_status";
import { PrismaClient,Prisma } from "../generated/prisma";

const prisma = new PrismaClient();
const LAMPORTS_PER_SOL = 1_000_000_000n;
const TOKEN_DECIMALS = 6n;
export async function saveBondingCurveTest(
  curveAddr: string,
  bondingCurveState: BondingCurveStateProps
) {
  try {
      let tokenPriceSol = calculateBondingCurvePrice(bondingCurveState);
    
    // Convert to string with proper decimal places
    const priceString = tokenPriceSol.toFixed(10);
    console.log('ZZZZZZZZZZZZZZZ:',priceString)
    const saved = await prisma.bondingCurveTest.create({
      
      data: {
        
        curveAddr,
        Tokenprice: priceString ,
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
