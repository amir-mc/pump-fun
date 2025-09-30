// src/pump-listener.ts
import { Connection, clusterApiUrl, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

// Pump.fun Program ID
const PUMP_PROGRAM_ID = new PublicKey(`${process.env.PUMP_PROGRAM_ID}`);

// Discriminators
const BUY_DISCRIMINATOR = Buffer.from("66063d1201daebea", "hex");
const SELL_DISCRIMINATOR = Buffer.from("33e685a4017f83ad", "hex");

export async function GetTokenCurve(bondingCurveKey: string): Promise<PublicKey> {
     return new Promise((resolve, reject) => {
    console.log(`⏳ Received bonding curve key: ${bondingCurveKey}. Will process in 30 seconds...`);

    setTimeout(async () => {
      try {
        const curvePubkey = new PublicKey(bondingCurveKey);
        console.log(`✅ Processing bonding curve after delay: ${curvePubkey.toBase58()}`);
        resolve(curvePubkey);
      } catch (err) {
        console.error(`❌ Invalid bonding curve key: ${bondingCurveKey}`, err);
        reject(err);
      }
    }, 70 * 1000); 
  });
}
//   return new Promise((resolve) => {
//     console.log(`⏳ Received bonding curve key: ${bondingCurveKey}. Will process in 5 minutes...`);

//     setTimeout(() => {
//       try {
//         const curvePubkey = new PublicKey(bondingCurveKey);
//         console.log(`✅ Processing bonding curve after delay: ${curvePubkey.toBase58()}`);
//         resolve(curvePubkey);
//       } catch (err) {
//         console.error(`❌ Invalid bonding curve key: ${bondingCurveKey}`, err);
//       }
//     }, 5 * 60 * 1000); // 5 دقیقه
//   });



async function main() {
  const connection = new Connection(
    process.env.SOLANA_NODE_RPC_ENDPOINT || clusterApiUrl("mainnet-beta"),
    "confirmed"
  );

  console.log("🚀 Subscribing to Pump.fun logs...");

  connection.onLogs(PUMP_PROGRAM_ID, async (logInfo) => {
    const { signature, logs } = logInfo;

    let instructionType: "Buy" | "Sell" | null = null;
    for (const log of logs) {
      if (log.includes("Instruction: Buy")) instructionType = "Buy";
      if (log.includes("Instruction: Sell")) instructionType = "Sell";
    }

    if (instructionType) {
      console.log(`\n🆕 New Bonding Curve ${instructionType} Transaction Detected!`);
      console.log(`🔗 Signature: ${signature}`);

      try {
        // Fetch transaction details with parsed instructions
        const tx = await connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        //  encoding: "jsonParsed",
        });

        if (!tx) {
          console.log("❌ Failed to fetch transaction details.");
          return;
        }

        const message = tx.transaction.message;
        const meta = tx.meta;

        for (const ix of message.instructions as any[]) {
          if (ix.programId === PUMP_PROGRAM_ID.toBase58()) {
            // Base64 decode instruction data
            const dataB64 = ix.data;
            if (typeof dataB64 === "string") {
              const data = Buffer.from(dataB64, "base64");

              if (data.length >= 24) {
                const discriminator = data.subarray(0, 8);
                const amount = data.readBigUInt64LE(8);
                const solLimit = data.readBigUInt64LE(16);

                if (discriminator.equals(BUY_DISCRIMINATOR)) {
                  console.log(
                    `✅ Buy: Tokens Bought: ${amount}, Max SOL Cost: ${Number(solLimit) / 1e9} SOL`
                  );
                } else if (discriminator.equals(SELL_DISCRIMINATOR)) {
                  console.log(
                    `✅ Sell: Tokens Sold: ${amount}, Min SOL Output: ${Number(solLimit) / 1e9} SOL`
                  );
                }
              }
            }

            // Mint address (usually 2nd or 3rd account)
                const accounts: number[] = ix.accounts; // اینها اندیس هستند نه آدرس‌ها
                    if (accounts.length >= 3) {
                    const accountIndex = accounts[2];
                    const mintAccount = message.accountKeys[accountIndex];
                    const mintAddress = mintAccount.pubkey.toBase58();
                    console.log(`🪙 Mint Address: ${mintAddress}`);
                    }
          }
        }

        // Token balance changes
        if (meta?.preTokenBalances && meta?.postTokenBalances) {
          for (let i = 0; i < meta.preTokenBalances.length; i++) {
            const pre = meta.preTokenBalances[i];
            const post = meta.postTokenBalances[i];
            if (pre.mint === post.mint) {
              const change =
                (post.uiTokenAmount.uiAmount || 0) -
                (pre.uiTokenAmount.uiAmount || 0);
              if (change !== 0) {
                console.log(`📊 Token Balance Change: ${change}`);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error fetching transaction:", err);
      }
    }
  });
}

main().catch(console.error);
