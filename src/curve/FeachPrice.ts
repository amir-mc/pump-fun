import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import dotenv from "dotenv";

dotenv.config();

const LAMPORTS_PER_SOL = 1_000_000_000n;
const TOKEN_DECIMALS = 6n;
const CURVE_ADDRESS = "6GXfUqrmPM4VdN1NoDZsE155jzRegJngZRjMkGyby7do";

// discriminator محاسبه شده در پایتون: struct.pack("<Q", 6966180631402821399)
const EXPECTED_DISCRIMINATOR = Buffer.from("870dd2c6cf3c9c60", "hex"); 

interface BondingCurveStateProps {
  virtual_token_reserves: bigint;
  virtual_sol_reserves: bigint;
  real_token_reserves: bigint;
  real_sol_reserves: bigint;
  token_total_supply: bigint;
  complete: boolean;
}

class BondingCurveState implements BondingCurveStateProps {
  virtual_token_reserves: bigint;
  virtual_sol_reserves: bigint;
  real_token_reserves: bigint;
  real_sol_reserves: bigint;
  token_total_supply: bigint;
  complete: boolean;

  constructor(data: Buffer) {
    // skip first 8 bytes (discriminator)
    const buf = data.subarray(8);

    this.virtual_token_reserves = buf.readBigUInt64LE(0);
    this.virtual_sol_reserves = buf.readBigUInt64LE(8);
    this.real_token_reserves = buf.readBigUInt64LE(16);
    this.real_sol_reserves = buf.readBigUInt64LE(24);
    this.token_total_supply = buf.readBigUInt64LE(32);

    // Flag در construct یک bool (byte) بود
    this.complete = buf.readUInt8(40) !== 0;
  }
}

async function getBondingCurveState(
  conn: Connection,
  curveAddress: PublicKey
): Promise<BondingCurveState> {
  const accountInfo = await conn.getAccountInfo(curveAddress, "confirmed");
  if (!accountInfo?.data) {
    throw new Error("Invalid curve state: No data");
  }

  const data = accountInfo.data as Buffer;

  // چک کردن discriminator
  if (!data.subarray(0, 8).equals(EXPECTED_DISCRIMINATOR)) {
    throw new Error("Invalid curve state discriminator");
  }

  return new BondingCurveState(data);
}

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
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
