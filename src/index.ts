import * as dotenv from 'dotenv';
import { PumpPortalListener } from './listeners/PumpPortalListener';
import { TokenInfo } from './types';
import { TokenHandlerTester } from './listeners/TokenHandlerTester';

// Load environment variables
dotenv.config();

async function main() {
    console.log("🚀 Starting Pump.fun TypeScript Listener...");
    
    const listener = new PumpPortalListener();
    
    // Simple callback to handle new tokens
    const handleNewToken = async (tokenInfo: TokenInfo): Promise<void> => {
        // اینجا میتونید منطق پردازش توکن رو اضافه کنید
        // مثل ذخیره در دیتابیس، تحلیل قیمت و غیره

             console.log(`🆕 New token detected: ${tokenInfo.name}`);
        
        // یا از کلاس تست کننده استفاده کنید
        const tester = new TokenHandlerTester();
        await tester.handleNewToken(tokenInfo);
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