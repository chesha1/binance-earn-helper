import { SimpleEarnRestAPI } from '@binance/simple-earn';
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
export type ProcessedEarnProduct = Omit<SimpleEarnRestAPI.GetSimpleEarnFlexibleProductListResponseRowsInner, 'tierAnnualPercentageRate'> & {
    requiredAmount?: Decimal; // 当前阶梯需要的金额
    // 从业务上这些字段是肯定存在的，币安的开发为了偷懒都把所有字段设置成可选的了
    productId: string;
    asset: string;
    latestAnnualPercentageRate: string;
}

export type AvailableBalance = Record<string, Decimal>;