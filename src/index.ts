//index.ts
import * as dotenv from 'dotenv';
import { PumpPortalListener } from './listeners/PumpPortalListener';
import { TokenInfo } from './types';
import { checkTokenStatus, getBondingCurveState } from './curve/get_bonding_curve_status';
import { PrismaClient } from './generated/prisma';
import { GetTokenCurve } from './curve/pump-listener';
import { saveTokenToDB } from './services/dbService';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAndSaveSignaturesForCurve } from './curve/get_signature';


// Load environment variables
dotenv.config();
const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Starting Pump.fun TypeScript Listener...");
    
    const listener = new PumpPortalListener();
    
    // Simple callback to handle new tokens
const handleNewToken = async (tokenInfo: TokenInfo): Promise<void> => {
  console.log(`🆕 CURVE: ${tokenInfo.name}`);
  
  try {
    //await saveTokenToDB(tokenInfo);
    //await checkTokenStatus(tokenInfo);

    // ⚡ بعد از تاخیر 5 ثانیه‌ای checkTokenStatus:
    console.log(`⏳ Waiting 5s before fetching signatures for ${tokenInfo.name}`);
    await new Promise(r => setTimeout(r, 5000));

    const conn = new Connection(process.env.SOLANA_NODE_RPC_ENDPOINT!, "confirmed");
    const curveAddress = new PublicKey(tokenInfo.bondingCurve);
    const curveState = await getBondingCurveState(conn, curveAddress);

    // 🚀 اجرای تابع مخصوص ثبت signature ها
    await getAndSaveSignaturesForCurve(tokenInfo.bondingCurve, curveState);

  } catch (error: any) {
    console.error(`Error processing token: ${error.message}`);
  }
};

    
    
   
    try {
        console.log("👂 Starting to listen for new Pump.fun tokens...");
        await listener.startListening(handleNewToken);
    } catch (error) {
        console.error("❌ Error starting listener:", error);
        process.exit(1);
    }

   
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log("\n🛑 Shutting down...");
    process.exit(0);
});

main().catch(console.error);
