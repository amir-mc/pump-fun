/**
 * Module for checking the status of a token's bonding curve on Solana using Pump.fun program
 * Converted from Python to TypeScript (Node.js).
 *
 * Pump.fun docs:
 * https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_CREATOR_FEE_README.md
 */

import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { TokenInfo } from "../types";
import { PrismaClient } from "../generated/prisma";
import { saveBondingCurveTest } from "../services/dbService";



const LAMPORTS_PER_SOL = 1_000_000_000n;
const TOKEN_DECIMALS = 6n;
const CURVE_ADDRESS = "5XG833a6VFBo9fz9fpAXdgUUCeR9E3nPTGpBxdXL3prs";

dotenv.config();

const RPC_ENDPOINT = process.env.SOLANA_NODE_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";

const prisma = new PrismaClient();
// Token mint you want to check
const TOKEN_MINT = "...";

// Constants
const PUMP_PROGRAM_ID = new PublicKey(`${process.env.PUMP_PROGRAM_PUBLIC_KRY}`);
const EXPECTED_DISCRIMINATOR = Buffer.alloc(8);
EXPECTED_DISCRIMINATOR.writeBigUInt64LE(6966180631402821399n, 0);

export interface BondingCurveStateProps {
  virtual_token_reserves: bigint;
  virtual_sol_reserves: bigint;
  real_token_reserves: bigint;
  real_sol_reserves: bigint;
  token_total_supply: bigint;
  complete: boolean;
  creator?: PublicKey;
}

class BondingCurveState {
  virtual_token_reserves: bigint;
  virtual_sol_reserves: bigint;
  real_token_reserves: bigint;
  real_sol_reserves: bigint;
  token_total_supply: bigint;
  complete: boolean;
  creator?: PublicKey;

  constructor(data: Buffer) {
    if (!data.slice(0, 8).equals(EXPECTED_DISCRIMINATOR)) {
      throw new Error("Invalid curve state discriminator");
    }

    // ساختار قدیمی (بدون creator)
    if (data.length < 150) {
      this.virtual_token_reserves = data.readBigUInt64LE(8);
      this.virtual_sol_reserves = data.readBigUInt64LE(16);
      this.real_token_reserves = data.readBigUInt64LE(24);
      this.real_sol_reserves = data.readBigUInt64LE(32);
      this.token_total_supply = data.readBigUInt64LE(40);
      this.complete = data[48] !== 0;
    } else {
      // ساختار جدید (با creator)
      this.virtual_token_reserves = data.readBigUInt64LE(8);
      this.virtual_sol_reserves = data.readBigUInt64LE(16);
      this.real_token_reserves = data.readBigUInt64LE(24);
      this.real_sol_reserves = data.readBigUInt64LE(32);
      this.token_total_supply = data.readBigUInt64LE(40);
      this.complete = data[48] !== 0;
      this.creator = new PublicKey(data.slice(49, 81));
    }
  }
}


/**
 * Derive bonding curve PDA for a mint
 */
async function getAssociatedBondingCurveAddress(
  mint: PublicKey,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    programId
  );
}

/**
 * Fetch bonding curve account state
 */
async function getBondingCurveState(
  conn: Connection,
  curveAddress: PublicKey
): Promise<BondingCurveState> {
  try {
    const accInfo = await conn.getAccountInfo(curveAddress);
    if (!accInfo) {
      throw new Error("No account info returned for bonding curve address");
    }
    if (!accInfo.data || accInfo.data.length === 0) {
      throw new Error("No data returned for bonding curve state");
    }
    console.log("Account Info:", accInfo);  // چاپ اطلاعات حساب برای بررسی
    return new BondingCurveState(accInfo.data);
  } catch (error:any) {
    console.error(`Error fetching bonding curve state: ${error.message}`);
    throw new Error("Error accessing bonding curve");
  }
}



/**
 * Main function: check token bonding curve status
 */

function calculateBondingCurvePrice(curveState: BondingCurveState): number {
  if (
    curveState.virtual_token_reserves <= 0n ||
    curveState.virtual_sol_reserves <= 0n
  ) {
    throw new Error("Invalid reserve state");
  }

  const sol = Number(curveState.virtual_sol_reserves) / Number(LAMPORTS_PER_SOL);
  const tokens =
    Number(curveState.virtual_token_reserves) / 10 ** Number(TOKEN_DECIMALS);

  return sol / tokens;
}

async function main() {
  try {
    const endpoint =
      process.env.SOLANA_NODE_RPC_ENDPOINT || clusterApiUrl("mainnet-beta");
    const connection = new Connection(endpoint, "confirmed");

    const curveAddress = new PublicKey(CURVE_ADDRESS);
    const bondingCurveState = await getBondingCurveState(
      connection,
      curveAddress
    );

    const tokenPriceSol = calculateBondingCurvePrice(bondingCurveState);

    console.log("Token price:");
    console.log(`  ${tokenPriceSol.toFixed(10)} SOL`);
      // ✅ ذخیره موقت در DB
    await saveBondingCurveTest(curveAddress.toBase58(), bondingCurveState);
  } catch (e) {
    console.error("Error:", e);
  }
}


export async function checkTokenStatus(mintAddress: string):Promise<any> {
  try {
    const mint = new PublicKey(mintAddress);

    const [bondingCurveAddress, bump] = await getAssociatedBondingCurveAddress(
      mint,
      PUMP_PROGRAM_ID
    );

    console.log("\nToken status:");
    console.log("-".repeat(50));
    console.log(`Token mint:              ${mint.toBase58()}`);
    console.log(`Associated bonding curve: ${bondingCurveAddress.toBase58()}`);
    console.log(`Bump seed:               ${bump}`);
    console.log("-".repeat(50));

    const conn = new Connection(RPC_ENDPOINT, "confirmed");

    try {
      const curveState = await getBondingCurveState(conn, bondingCurveAddress);

      console.log("\nBonding curve status:");
      console.log("-".repeat(50));
      console.log(
        `Completion status: ${curveState.complete ? "Completed" : "Not completed"}`
      );

      if (curveState.complete) {
        console.log(
          "\nNote: This bonding curve has completed and liquidity has been migrated to PumpSwap."
        );
      }

      if (curveState.creator) {
        console.log(`Creator: ${curveState.creator.toBase58()}`);
      }
      console.log("-".repeat(50));
    } catch (e: any) {
      console.error(`\nError accessing bonding curve: ${e.message}`);
    }
  } catch (e: any) {
    console.error(`\nError: ${e.message}`);
  }
}

 export class BondingCurveStateTester {
  private conn: Connection;
  private curveAddress: PublicKey;
  private retries: number;

  constructor(rpcEndpoint: string, curveAddress: string, retries: number = 3) {
    this.conn = new Connection(rpcEndpoint, 'confirmed');
    this.curveAddress = new PublicKey(curveAddress);
    this.retries = retries;
  }

  // تابع برای گرفتن داده‌های BondingCurveState
   async getBondingCurveStateWithDelay(): Promise<BondingCurveStateProps> {
    let attempt = 0;
    while (attempt < this.retries) {
      try {
        console.log(`Attempt ${attempt + 1}: Fetching bonding curve state...`);
        const accInfo = await this.conn.getAccountInfo(this.curveAddress);

        if (!accInfo || !accInfo.data || accInfo.data.length === 0) {
          throw new Error("No data returned for bonding curve state");
        }

        const bondingCurveState = this.parseBondingCurveState(accInfo.data);
        console.log("Bonding curve state fetched successfully:", bondingCurveState);

        // ✅ ذخیره موقت در DB
        await saveBondingCurveTest(this.curveAddress.toBase58(), bondingCurveState);

        return bondingCurveState;
      } catch (error: any) {
        console.error(`Attempt ${attempt + 1}: Error - ${error.message}`);
        if (attempt < this.retries - 1) {
          console.log("Retrying after 8 minutes...");
          await new Promise((resolve) => setTimeout(resolve, 480000));
        }
        attempt++;
      }
    }
    throw new Error("Failed to fetch bonding curve state after retries");
  }


  // تابع برای تجزیه داده‌ها و بازگرداندن آنها به صورت BondingCurveStateProps
  private parseBondingCurveState(data: Buffer): BondingCurveStateProps {
    // فرض می‌کنیم که داده‌ها مطابق با فرمت مورد نظر آمده‌اند
    const virtual_token_reserves = data.readBigUInt64LE(8);
    const virtual_sol_reserves = data.readBigUInt64LE(16);
    const real_token_reserves = data.readBigUInt64LE(24);
    const real_sol_reserves = data.readBigUInt64LE(32);
    const token_total_supply = data.readBigUInt64LE(40);
    const complete = data[48] !== 0;  // فرض بر این است که فیلد complete در byte 48 است
    const creator = new PublicKey(data.slice(49, 81));  // فرض بر این است که creator در bytes 49-81 است

    return {
      virtual_token_reserves,
      virtual_sol_reserves,
      real_token_reserves,
      real_sol_reserves,
      token_total_supply,
      complete,
      creator,
    };
  }
}

// تست با آدرس مشخص
(async () => {
  try {
    const tester = new BondingCurveStateTester(
      'https://mainnet.helius-rpc.com/?api-key=1ac664ab-8e57-4bcf-a9e6-f96d8845a972', // RPC Endpoint
      '5XG833a6VFBo9fz9fpAXdgUUCeR9E3nPTGpBxdXL3prs' // Bonding Curve Address
    );

    const bondingCurveState = await tester.getBondingCurveStateWithDelay();
    console.log('Final Bonding Curve State:', bondingCurveState);

  } catch (error:any) {
    console.error('Test failed:', error.message);
  }
})();

// Run directly from CLI
if (require.main === module) {
  const mint = process.argv[2] || TOKEN_MINT;
  checkTokenStatus(mint).catch(console.error);
}
main();