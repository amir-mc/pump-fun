import * as dotenv from 'dotenv';
import { PumpPortalListener } from './listeners/PumpPortalListener';
import { TokenInfo } from './types';
import { BondingCurveStateTester, checkTokenStatus } from './curve/get_bonding_curve_status';
import { PrismaClient } from './generated/prisma';

// Load environment variables
dotenv.config();
const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Starting Pump.fun TypeScript Listener...");
    
    const listener = new PumpPortalListener();
    
    // Simple callback to handle new tokens
    const handleNewToken = async (tokenInfo: TokenInfo): Promise<void> => {
        // اینجا میتونید منطق پردازش توکن رو اضافه کنید
        console.log(`🆕 CURVE: ${tokenInfo.name}`);
            
        try {
            await checkTokenStatus(tokenInfo.bondingCurve); // ارسال پارامتر bondingCurve
        } catch (error:any) {
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
