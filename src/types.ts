import { RestSimpleEarnTypes } from '@binance/connector-typescript';
import { Decimal } from 'decimal.js';
import { Spot } from '@binance/spot';
import { SimpleEarn } from '@binance/simple-earn';
import { Wallet } from '@binance/wallet';

export interface Env {
    API_KEY: string;
    API_SECRET: string;
}

// 客户端配置接口
export interface Clients {
    spotClient: Spot;
    simpleEarnClient: SimpleEarn;
    walletClient: Wallet;
}

// 定义处理后的产品项目接口
export type ProcessedEarnProduct = Omit<RestSimpleEarnTypes.getSimpleEarnFlexibleProductListRows, 'tierAnnualPercentageRate'> & {
    requiredAmount?: Decimal; // 当前阶梯需要的金额
}

export type AvailableBalance = Record<string, Decimal>;