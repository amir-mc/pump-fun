// scripts/startMonitorOnly.ts

import { TokenMonitorService } from "../../services/tokenMonitorService";


async function startMonitorOnly() {
  console.log('🚀 Starting Token Monitor Service Only...');
  
  const monitor = new TokenMonitorService();
  
  try {
    await monitor.startMonitoring();
    
    // اجرا برای همیشه
    await new Promise(() => {});
    
  } catch (error) {
    console.error('💥 Monitor service failed:', error);
    await monitor.stopMonitoring();
    process.exit(1);
  }
}

// اجرا اگر فایل مستقیماً فراخوانی شود
if (require.main === module) {
  startMonitorOnly().catch(console.error);
}

export { startMonitorOnly };