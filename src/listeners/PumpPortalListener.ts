//PumpPortalListener.ts
import { Buffer } from 'buffer';
import { TokenInfo, ParsedCreateData } from '../types';

const bs58 = require('bs58');
const WebSocket = require('ws');

export class PumpPortalListener {
    private static readonly PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
    
    private isListening: boolean;
    private callback: ((tokenInfo: TokenInfo) => Promise<void>) | null;

    constructor() {
        this.isListening = false;
        this.callback = null;
    }

    public async startListening(tokenCallback: (tokenInfo: TokenInfo) => Promise<void>): Promise<void> {
        this.callback = tokenCallback;
        this.isListening = true;

        await this.listenForNewTokens(tokenCallback);
    }

    public async stopListening(): Promise<void> {
        this.isListening = false;
    }

    private async listenForNewTokens(callback: (tokenInfo: TokenInfo) => Promise<void>): Promise<void> {
        const wsEndpoint = process.env.WS_ENDPOINTS?.split(',')[0]?.trim();
        if (!wsEndpoint) {
            throw new Error("No WebSocket endpoints found in WS_ENDPOINTS environment variable");
        }

        console.log(`🔗 Connecting directly to: ${wsEndpoint}`);

        return new Promise((resolve, reject) => {
            const websocket = new WebSocket(wsEndpoint);

            websocket.on('open', () => {
                console.log(`✅ Connected to WebSocket: ${wsEndpoint}`);
                const subscriptionMessage = {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "logsSubscribe",
                    params: [
                        { mentions: [process.env.PUMP_PROGRAM_ID] },
                        { commitment: "processed" },
                    ],
                };
                websocket.send(JSON.stringify(subscriptionMessage));
                console.log(`✅ Successfully subscribed to Pump.fun logs`);
                console.log("👂 Listening for new token creations...");
            });

            websocket.on('message', async (data: any) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.method === "logsNotification") {
                        await this.handleTokenMessage(message, callback, wsEndpoint);
                    }
                } catch (error) {
                    console.error(`⚠️ Error processing message: ${error}`);
                }
            });

            websocket.on('error', (error: Error) => {
                console.error(`❌ WebSocket error: ${error}`);
                reject(error);
            });

            websocket.on('close', () => {
                console.log("🔒 WebSocket connection closed");
            });
        });
    }

    private async handleTokenMessage(data: any, callback: (tokenInfo: TokenInfo) => Promise<void>, wsEndpoint: string): Promise<void> {
        try {
            if (data.method !== "logsNotification") {
                return;
            }

            const logData = data.params.result.value;
            const logs: string[] = logData.logs || [];

            if (!this.isCreateInstruction(logs)) {
                return;
            }

            console.log(`📝 Found Create instruction in logs`);
            

            for (const log of logs) {
                if (log.includes("Program data:")) {
                    try {
                        const encodedData = log.split(": ")[1];
                        const dataBytes = Buffer.from(encodedData, 'base64');
                        
                        const parsed = this.parseCreateInstruction(dataBytes);
                        if (!parsed || !parsed.name) {
                            continue;
                        }

                        const tokenInfo: TokenInfo = {
                            name: parsed.name || "Unknown",
                            symbol: parsed.symbol || "UNK",
                            mint: parsed.mint || "",
                            address: parsed.mint || "",
                            uri: parsed.uri || "",
                            bondingCurve: parsed.bondingCurve || "",
                            user: parsed.user || "",
                            creator: parsed.creator || "",
                            signature: logData.signature || "",
                            timestamp: Date.now(),
                            method: "websocket_load_balancer",
                            endpointUsed: wsEndpoint,
                            bondingCurveKey: parsed.bondingCurve || "",
                            marketCapSol: 0,
                            vSolInBondingCurve: 0,
                            vTokensInBondingCurve: 0,
                            initialBuy: 0,
                            traderPublicKey: parsed.user || "",
                        };

                        console.log("\n" + "=".repeat(80));
                        console.log(`🆕 NEW PUMP.FUN TOKEN DETECTED via ${wsEndpoint}!`);
                        console.log("=" + "=".repeat(79));
                        console.log(`Name:           ${tokenInfo.name}`);
                        console.log(`Symbol:         ${tokenInfo.symbol}`);
                        console.log(`Mint Address:   ${tokenInfo.mint}`);
                        console.log(`Bonding Curve:  ${tokenInfo.bondingCurve}`);
                        console.log(`Creator:        ${tokenInfo.creator}`);
                        console.log(`User:           ${tokenInfo.user}`);
                        console.log(`Signature:      ${tokenInfo.signature}`);
                        console.log(`Timestamp:      ${new Date(tokenInfo.timestamp).toISOString()}`);
                        console.log(`Load Balancer:  ${wsEndpoint}`);
                        console.log("=" + "=".repeat(79));
                  
                        if (callback) {
                            await callback(tokenInfo);
                        }
                    } catch (error) {
                        console.error(`❌ Error parsing token data: ${error}`);
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Error in token message handler: ${error}`);
        }
    }

    private parseCreateInstruction(data: Buffer): ParsedCreateData | null {
        if (data.length < 8) {
            return null;
        }
        let offset = 8;
        const parsedData: any = {};

        const fields = [
            { name: "name", type: "string" },
            { name: "symbol", type: "string" },
            { name: "uri", type: "string" },
            { name: "mint", type: "publicKey" },
            { name: "bondingCurve", type: "publicKey" },
            { name: "user", type: "publicKey" },
            { name: "creator", type: "publicKey" },
        ];

        try {
            for (const field of fields) {
                if (field.type === "string") {
                    const length = data.readUInt32LE(offset);
                    offset += 4;
                    const value = data.toString("utf-8", offset, offset + length);
                    offset += length;
                    parsedData[field.name] = value;
                } else if (field.type === "publicKey") {
                    const keyBytes = data.subarray(offset, offset + 32);
                    const value = bs58.encode(keyBytes);
                    offset += 32;
                    parsedData[field.name] = value;
                }
            }
            return parsedData;
        } catch (error) {
            return null;
        }
    }

    private isCreateInstruction(logs: string[]): boolean {
        return logs.some(log => log.includes("Program log: Instruction: Create"));
    }
}