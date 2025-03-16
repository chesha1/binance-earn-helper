import { Spot, RestWalletTypes, RestSimpleEarnTypes } from '@binance/connector-typescript';
import { Decimal } from 'decimal.js';
import { AvailableBalance } from './types';

// 定义支持的稳定币数组
export const STABLE_COINS = ['USDT', 'USDC', 'FDUSD'];

export async function handler(API_KEY: string, API_SECRET: string, LOCKED_ASSETS: boolean) {
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

    // 查询稳定币理财产品列表
    const earnProductList = await getEarnProductList(client, LOCKED_ASSETS)

    return earnProductList
}

// 查询理财账户活期可用余额
async function getEarnWalletBalance(client: Spot) {
    const requests = STABLE_COINS.map(coin =>
        client.getFlexibleProductPosition({
            asset: coin
        })
    );

    const responses = await Promise.all(requests);
    console.log(responses)

    // 合并所有响应的rows
    const rows = responses.flatMap(res => res.rows);

    const res = {
        rows: rows,
        total: rows.length
    }
    return res
}

// 计算可用"余额"，这里的余额指的是可以调用的数字，在后续的每一次调仓中，会减少
// 可能不需要了，以后三个账户单独计算余额
async function calculateAvailableBalance(
    spotWalletBalance: RestWalletTypes.userAssetResponse[],
    earnWalletBalance: RestSimpleEarnTypes.getFlexibleProductPositionResponse,
    fundingWalletBalance: RestWalletTypes.fundingWalletResponse[]) {

    // 初始化可用余额对象
    const availableBalance: AvailableBalance = {};

    // 为每种稳定币初始化余额为0
    STABLE_COINS.forEach(coin => {
        availableBalance[coin] = new Decimal(0);
    });

    // 资金账户稳定币余额
    fundingWalletBalance.forEach((item) => {
        if (STABLE_COINS.includes(item.asset)) {
            availableBalance[item.asset] = new Decimal(item.free || 0);
        }
    });

    // 理财账户活期余额
    earnWalletBalance.rows.forEach((item) => {
        if (STABLE_COINS.includes(item.asset)) {
            availableBalance[item.asset] = availableBalance[item.asset].plus(new Decimal(item.totalAmount || 0));
        }
    });

    // 现货账户余额
    spotWalletBalance.forEach((item) => {
        if (STABLE_COINS.includes(item.asset)) {
            availableBalance[item.asset] = availableBalance[item.asset].plus(new Decimal(item.free || 0));
        }
    });

    return availableBalance;
}

// 查询稳定币理财产品列表，不包含存贷易产品
async function getEarnProductList(client: Spot, LOCKED_ASSETS: boolean) {
    // 定义产品项目接口
    interface ProductItem {
        isSoldOut?: boolean;
        detail?: {
            isSoldOut?: boolean;
        };
    }

    // 查询灵活产品
    const flexibleRequests = STABLE_COINS.map(coin =>
        client.getSimpleEarnFlexibleProductList({
            asset: coin
        })
    );

    const flexibleResponses = await Promise.all(flexibleRequests);

    // 只有当LOCKED_ASSETS为true时，才查询定期产品
    let lockedResponses: RestSimpleEarnTypes.getSimpleEarnLockedProductListResponse[] = [];

    if (LOCKED_ASSETS) {
        const lockedRequests = STABLE_COINS.map(coin =>
            client.getSimpleEarnLockedProductList({
                asset: coin
            })
        );

        lockedResponses = await Promise.all(lockedRequests);
    }

    // 过滤掉已售罄(isSoldOut = true)的产品
    const filterNotSoldOut = (item: ProductItem) => {
        // 检查直接属性isSoldOut
        if (item.isSoldOut === true) {
            return false;
        }
        // 检查detail.isSoldOut
        if (item.detail && item.detail.isSoldOut === true) {
            return false;
        }
        return true;
    };

    // 合并所有灵活产品和锁定产品的rows，并过滤掉已售罄的产品
    const filteredRows = [
        ...flexibleResponses.flatMap(res => res.rows.filter(filterNotSoldOut)),
        ...lockedResponses.flatMap(res => res.rows.filter(filterNotSoldOut))
    ];

    const res = {
        rows: filteredRows,
        total: filteredRows.length
    }
    return res
}

