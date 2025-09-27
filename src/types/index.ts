export interface TokenInfo {
    name: string;
    symbol: string;
    mint: string;
    address: string;
    uri: string;
    bondingCurve: string;
    user: string;
    creator: string;
    signature: string;
    timestamp: number;
    method: string;
    endpointUsed: string;
    bondingCurveKey: string;
    marketCapSol: number;
    vSolInBondingCurve: number;
    vTokensInBondingCurve: number;
    initialBuy: number;
    traderPublicKey: string;
}

export interface ParsedCreateData {
    name?: string;
    symbol?: string;
    uri?: string;
    mint?: string;
    bondingCurve?: string;
    user?: string;
    creator?: string;
}