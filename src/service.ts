import { Spot, RestWalletTypes, RestSimpleEarnTypes } from '@binance/connector-typescript';
import { Decimal } from 'decimal.js';
import { AvailableBalance } from './types';

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

// 查询稳定币理财产品列表，不包含存贷易产品
async function getEarnProductList(client: Spot, LOCKED_ASSETS: boolean) {
    // 定义产品项目接口
    interface ProductItem {
        isSoldOut?: boolean;
        detail?: {
            isSoldOut?: boolean;
        };
    }

    const [resFlexibleUSDT, resFlexibleUSDC, resFlexibleFDUSD] = await Promise.all([
        client.getSimpleEarnFlexibleProductList({
            asset: 'USDT'
        }),
        client.getSimpleEarnFlexibleProductList({
            asset: 'USDC'
        }),
        client.getSimpleEarnFlexibleProductList({
            asset: 'FDUSD'
        })
    ]);

    // 只有当LOCKED_ASSETS为true时，才查询锁定产品
    let resLockedUSDT: RestSimpleEarnTypes.getSimpleEarnLockedProductListResponse = { rows: [], total: 0 };
    let resLockedUSDC: RestSimpleEarnTypes.getSimpleEarnLockedProductListResponse = { rows: [], total: 0 };
    let resLockedFDUSD: RestSimpleEarnTypes.getSimpleEarnLockedProductListResponse = { rows: [], total: 0 };

    if (LOCKED_ASSETS) {
        [resLockedUSDT, resLockedUSDC, resLockedFDUSD] = await Promise.all([
            client.getSimpleEarnLockedProductList({
                asset: 'USDT'
            }),
            client.getSimpleEarnLockedProductList({
                asset: 'USDC'
            }),
            client.getSimpleEarnLockedProductList({
                asset: 'FDUSD'
            }),
        ]);
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

    const filteredRows = [
        ...resFlexibleUSDT.rows.filter(filterNotSoldOut),
        ...resFlexibleUSDC.rows.filter(filterNotSoldOut),
        ...resFlexibleFDUSD.rows.filter(filterNotSoldOut),
        ...resLockedUSDT.rows.filter(filterNotSoldOut),
        ...resLockedUSDC.rows.filter(filterNotSoldOut),
        ...resLockedFDUSD.rows.filter(filterNotSoldOut)
    ];

    const res = {
        rows: filteredRows,
        total: filteredRows.length
    }
    return res
}

