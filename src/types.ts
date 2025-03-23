import { Decimal } from 'decimal.js';

export interface Env {
    API_KEY: string;
    API_SECRET: string;
    LOCKED_ASSETS: string; // 是否购买定期理财
}

export type AvailableBalance = Record<string, Decimal>;