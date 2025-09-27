"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PumpPortalListener = void 0;
const buffer_1 = require("buffer");
const bs58 = require('bs58');
const WebSocket = require('ws');
class PumpPortalListener {
    constructor() {
        this.isListening = false;
        this.callback = null;
    }
    startListening(tokenCallback) {
        return __awaiter(this, void 0, void 0, function* () {
            this.callback = tokenCallback;
            this.isListening = true;
            yield this.listenForNewTokens(tokenCallback);
        });
    }
    stopListening() {
        return __awaiter(this, void 0, void 0, function* () {
            this.isListening = false;
        });
    }
    listenForNewTokens(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const wsEndpoint = (_b = (_a = process.env.WS_ENDPOINTS) === null || _a === void 0 ? void 0 : _a.split(',')[0]) === null || _b === void 0 ? void 0 : _b.trim();
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
                            { mentions: [PumpPortalListener.PUMP_PROGRAM_ID] },
                            { commitment: "processed" },
                        ],
                    };
                    websocket.send(JSON.stringify(subscriptionMessage));
                    console.log(`✅ Successfully subscribed to Pump.fun logs`);
                    console.log("👂 Listening for new token creations...");
                });
                websocket.on('message', (data) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const message = JSON.parse(data.toString());
                        if (message.method === "logsNotification") {
                            yield this.handleTokenMessage(message, callback, wsEndpoint);
                        }
                    }
                    catch (error) {
                        console.error(`⚠️ Error processing message: ${error}`);
                    }
                }));
                websocket.on('error', (error) => {
                    console.error(`❌ WebSocket error: ${error}`);
                    reject(error);
                });
                websocket.on('close', () => {
                    console.log("🔒 WebSocket connection closed");
                });
            });
        });
    }
    handleTokenMessage(data, callback, wsEndpoint) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (data.method !== "logsNotification") {
                    return;
                }
                const logData = data.params.result.value;
                const logs = logData.logs || [];
                if (!this.isCreateInstruction(logs)) {
                    return;
                }
                console.log(`📝 Found Create instruction in logs`);
                for (const log of logs) {
                    if (log.includes("Program data:")) {
                        try {
                            const encodedData = log.split(": ")[1];
                            const dataBytes = buffer_1.Buffer.from(encodedData, 'base64');
                            const parsed = this.parseCreateInstruction(dataBytes);
                            if (!parsed || !parsed.name) {
                                continue;
                            }
                            const tokenInfo = {
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
                                yield callback(tokenInfo);
                            }
                        }
                        catch (error) {
                            console.error(`❌ Error parsing token data: ${error}`);
                        }
                    }
                }
            }
            catch (error) {
                console.error(`❌ Error in token message handler: ${error}`);
            }
        });
    }
    parseCreateInstruction(data) {
        if (data.length < 8) {
            return null;
        }
        let offset = 8;
        const parsedData = {};
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
                }
                else if (field.type === "publicKey") {
                    const keyBytes = data.subarray(offset, offset + 32);
                    const value = bs58.encode(keyBytes);
                    offset += 32;
                    parsedData[field.name] = value;
                }
            }
            return parsedData;
        }
        catch (error) {
            return null;
        }
    }
    isCreateInstruction(logs) {
        return logs.some(log => log.includes("Program log: Instruction: Create"));
    }
}
exports.PumpPortalListener = PumpPortalListener;
PumpPortalListener.PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
