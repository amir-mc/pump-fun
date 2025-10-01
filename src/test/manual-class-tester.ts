
//  export class BondingCurveStateTester {
//   private conn: Connection;
//   private curveAddress: PublicKey;
//   private retries: number;


//   constructor(rpcEndpoint: string, curveAddress: string, retries: number = 3) {
//     this.conn = new Connection(rpcEndpoint, 'confirmed');
//     this.curveAddress = new PublicKey(curveAddress);
//     this.retries = retries;
//   }

//   // تابع برای گرفتن داده‌های BondingCurveState
//    async getBondingCurveStateWithDelay(): Promise<BondingCurveStateProps> {
//     let attempt = 0;
//     while (attempt < this.retries) {
//       try {
//         console.log(`Attempt ${attempt + 1}: Fetching bonding curve state...`);
//         const accInfo = await this.conn.getAccountInfo(this.curveAddress);

//         if (!accInfo || !accInfo.data || accInfo.data.length === 0) {
//           throw new Error("No data returned for bonding curve state");
//         }

//         const bondingCurveState = this.parseBondingCurveState(accInfo.data);
//         console.log("Bonding curve state fetched successfully:", bondingCurveState);

//         // ✅ ذخیره موقت در DB
//         await saveBondingCurveTest(this.curveAddress.toBase58(), bondingCurveState);

//         return bondingCurveState;
//       } catch (error: any) {
//         console.error(`Attempt ${attempt + 1}: Error - ${error.message}`);
//         if (attempt < this.retries - 1) {
//           console.log("Retrying after 8 minutes...");
//           await new Promise((resolve) => setTimeout(resolve, 480000));
//         }
//         attempt++;
//       }
//     }
//     throw new Error("Failed to fetch bonding curve state after retries");
//   }


//   // تابع برای تجزیه داده‌ها و بازگرداندن آنها به صورت BondingCurveStateProps
//   private parseBondingCurveState(data: Buffer): BondingCurveStateProps {
//     // فرض می‌کنیم که داده‌ها مطابق با فرمت مورد نظر آمده‌اند
//     const virtual_token_reserves = data.readBigUInt64LE(8);
//     const virtual_sol_reserves = data.readBigUInt64LE(16);
//     const real_token_reserves = data.readBigUInt64LE(24);
//     const real_sol_reserves = data.readBigUInt64LE(32);
//     const token_total_supply = data.readBigUInt64LE(40);
//     const complete = data[48] !== 0;  // فرض بر این است که فیلد complete در byte 48 است
//     const creator = new PublicKey(data.slice(49, 81));  // فرض بر این است که creator در bytes 49-81 است

//     return {
//       virtual_token_reserves,
//       virtual_sol_reserves,
//       real_token_reserves,
//       real_sol_reserves,
//       token_total_supply,
//       complete,
//       creator,
//     };
//   }
// }

// // تست با آدرس مشخص
// (async () => {
//   try {
//     const tester = new BondingCurveStateTester(
//       'https://mainnet.helius-rpc.com/?api-key=1ac664ab-8e57-4bcf-a9e6-f96d8845a972', // RPC Endpoint
//       'GsdsAVpqBfF5GWAmCtJ9ZeBfZMCTsrCN9A8uQ3cRG9yA' // Bonding Curve Address
//     );

//     const bondingCurveState = await tester.getBondingCurveStateWithDelay();
//     console.log('Final Bonding Curve State:', bondingCurveState);

//   } catch (error:any) {
//     console.error('Test failed:', error.message);
//   }
// })();

// Run directly from CLI