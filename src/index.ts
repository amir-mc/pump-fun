//index.ts
import * as dotenv from 'dotenv';
import { PumpPortalListener } from './listeners/PumpPortalListener';
import { TokenInfo } from './types';
import { checkTokenStatus } from './curve/get_bonding_curve_status';
import { PrismaClient } from './generated/prisma';
import { GetTokenCurve } from './curve/pump-listener';
import { saveTokenToDB } from './services/dbService';


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
      // ✅ ذخیره اولیه با همه جزئیات
      await saveTokenToDB(tokenInfo);

      // ✅ چک کردن وضعیت بعد از تأخیر (فقط قیمت و state رو آپدیت می‌کنه)
      await checkTokenStatus(tokenInfo);
        
    } catch (error:any) {
        console.error(`Error processing token: ${error.message}`);
    } 
   
        try {
            await GetTokenCurve(tokenInfo.bondingCurve)
        } catch (error:any) {
            console.error(`Error processing token: ${error.message}`);
        }

        // try {
        //     await GetTokenPrice(tokenInfo.mint)
        // } catch (error:any) {
        //      console.error(`Error processing token: ${error.message}`);
            
        // }

       
    };

    
    
    //موقتا غیر فعال
    // try {
    //     console.log("👂 Starting to listen for new Pump.fun tokens...");
    //     await listener.startListening(handleNewToken);
    // } catch (error) {
    //     console.error("❌ Error starting listener:", error);
    //     process.exit(1);
    // }

   
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log("\n🛑 Shutting down...");
    process.exit(0);
});

main().catch(console.error);
