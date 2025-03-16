import { Decimal } from 'decimal.js';

export interface Env {
    API_KEY: string;
    API_SECRET: string;
}

export interface AvailableBalance {
    USDT: Decimal;
    USDC: Decimal;
    FDUSD: Decimal;
}
