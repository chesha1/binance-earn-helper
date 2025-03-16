import { Spot, RestWalletTypes, RestSimpleEarnTypes } from '@binance/connector-typescript';
import { Decimal } from 'decimal.js';
import { AvailableBalance } from './types';

export async function handler(API_KEY: string, API_SECRET: string) {
    const BASE_URL = 'https://api.binance.com';
    const client = new Spot(API_KEY, API_SECRET, { baseURL: BASE_URL });

    // 获取现货、理财活期、资金账户账户余额
    const [spotWalletBalance, earnWalletBalance, fundingWalletBalance] = await Promise.all([
        client.userAsset(),
        getEarnWalletBalance(client),
        client.fundingWallet()
    ])

    // 汇总各个币可用余额
    const availableBalance = calculateAvailableBalance(spotWalletBalance, earnWalletBalance, fundingWalletBalance)

    return availableBalance
}

// 查询理财账户活期可用余额
// 防止持有币的种类太多，手动指定类型查三次然后合并，其他两种账户没有分页的参数，看来是会全量返回，就不手动封装了
async function getEarnWalletBalance(client: Spot) {
    const [resUSDT, resUSDC, resFDUSD] = await Promise.all([
        client.getFlexibleProductPosition({
            asset: 'USDT'
        }),
        client.getFlexibleProductPosition({
            asset: 'USDC'
        }),
        client.getFlexibleProductPosition({
            asset: 'FDUSD'
        })
    ]);
    const rows = [...resUSDT.rows, ...resUSDC.rows, ...resFDUSD.rows];
    const res = {
        rows: rows,
        total: rows.length
    }
    return res
}

// 计算可用"余额"，这里的余额指的是可以调用的数字，在后续的每一次调仓中，会减少
async function calculateAvailableBalance(
    spotWalletBalance: RestWalletTypes.userAssetResponse[],
    earnWalletBalance: RestSimpleEarnTypes.getFlexibleProductPositionResponse,
    fundingWalletBalance: RestWalletTypes.fundingWalletResponse[]) {

    // 初始化可用余额对象
    const availableBalance: AvailableBalance = {
        USDT: new Decimal(0),
        USDC: new Decimal(0),
        FDUSD: new Decimal(0)
    };

    // 资金账户稳定币余额
    fundingWalletBalance.forEach((item) => {
        if (item.asset === 'USDT') {
            availableBalance.USDT = new Decimal(item.free || 0);
        } else if (item.asset === 'USDC') {
            availableBalance.USDC = new Decimal(item.free || 0);
        } else if (item.asset === 'FDUSD') {
            availableBalance.FDUSD = new Decimal(item.free || 0);
        }
    });

    // 理财账户活期余额
    earnWalletBalance.rows.forEach((item) => {
        if (item.asset === 'USDT') {
            availableBalance.USDT = availableBalance.USDT.plus(new Decimal(item.totalAmount || 0));
        } else if (item.asset === 'USDC') {
            availableBalance.USDC = availableBalance.USDC.plus(new Decimal(item.totalAmount || 0));
        } else if (item.asset === 'FDUSD') {
            availableBalance.FDUSD = availableBalance.FDUSD.plus(new Decimal(item.totalAmount || 0));
        }
    });

    // 现货账户余额
    spotWalletBalance.forEach((item) => {
        if (item.asset === 'USDT') {
            availableBalance.USDT = availableBalance.USDT.plus(new Decimal(item.free || 0));
        } else if (item.asset === 'USDC') {
            availableBalance.USDC = availableBalance.USDC.plus(new Decimal(item.free || 0));
        } else if (item.asset === 'FDUSD') {
            availableBalance.FDUSD = availableBalance.FDUSD.plus(new Decimal(item.free || 0));
        }
    });

    return availableBalance;
}