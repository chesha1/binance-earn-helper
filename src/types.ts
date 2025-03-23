import { RestSimpleEarnTypes } from '@binance/connector-typescript';
import { Decimal } from 'decimal.js';

export interface Env {
    API_KEY: string;
    API_SECRET: string;
    LOCKED_ASSETS: string; // 是否购买定期理财
}

// 定义处理后的产品项目接口
export type ProcessedEarnProduct = Omit<RestSimpleEarnTypes.getSimpleEarnFlexibleProductListRows, 'tierAnnualPercentageRate'> & {
    tier?: string; // 可选的 tier 属性
}

export type AvailableBalance = Record<string, Decimal>;