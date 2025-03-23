import { Spot, RestWalletTypes, RestSimpleEarnTypes } from '@binance/connector-typescript';
import { Decimal } from 'decimal.js';
import { AvailableBalance } from './types';

// 定义支持的稳定币数组
export const STABLE_COINS = ['USDT', 'USDC', 'FDUSD'];

export async function handler(API_KEY: string, API_SECRET: string, LOCKED_ASSETS: boolean) {
    const BASE_URL = 'https://api.binance.com';
    const client = new Spot(API_KEY, API_SECRET, { baseURL: BASE_URL });

    // 获取现货、理财活期、资金账户账户余额
    // 现货和资金账户会返回全量数据不分页，就不单独查询再合并了
    const [spotWalletBalance, earnWalletBalance, fundingWalletBalance] = await Promise.all([
        client.userAsset(),
        getEarnWalletBalance(client),
        client.fundingWallet()
    ])

    // 查询稳定币理财产品列表
    const earnProductList = await getEarnProductList(client, LOCKED_ASSETS)

    // 处理 earnProductList 并按收益率排序
    const processedProducts = processEarnProductList(earnProductList)

    return processedProducts
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

// 处理理财产品列表，展开 tierAnnualPercentageRate 并排序
function processEarnProductList(earnProductList: {
    rows: any[];
    total: number;
}) {
    // 定义处理后的产品项目接口
    interface ProcessedEarnProduct {
        [key: string]: any; // 允许任意属性
        latestAnnualPercentageRate: string; // 最新年化收益率
        tier?: string; // 可选的 tier 属性
    }

    const processedRows: ProcessedEarnProduct[] = [];

    // 处理每个产品
    earnProductList.rows.forEach((item) => {
        // 如果不存在 tierAnnualPercentageRate，直接添加原始项
        if (!item.tierAnnualPercentageRate) {
            processedRows.push(item as ProcessedEarnProduct);
            return;
        }

        // 对于有 tierAnnualPercentageRate 的项目
        // 1. 首先创建一个保留原始 latestAnnualPercentageRate 的项目（不添加额外利率）
        const baseItem: ProcessedEarnProduct = { ...item };
        delete baseItem.tierAnnualPercentageRate; // 删除 tierAnnualPercentageRate 属性
        processedRows.push(baseItem);

        // 2. 为 tierAnnualPercentageRate 中的每个键值对创建单独的项目
        Object.entries(item.tierAnnualPercentageRate).forEach(([tier, rate]) => {
            // 创建新项，复制原始项的所有属性
            const newItem: ProcessedEarnProduct = { ...item };
            // 删除 tierAnnualPercentageRate 属性
            delete newItem.tierAnnualPercentageRate;
            
            // 计算新的年化收益率（原始值加上 tier 对应的值）
            newItem.latestAnnualPercentageRate = 
                (parseFloat(item.latestAnnualPercentageRate) + parseFloat(rate as string)).toString();
            
            // 添加 tier 属性保存键名
            newItem.tier = tier;
            
            // 添加到处理后的数组
            processedRows.push(newItem);
        });
    });

    // 按 latestAnnualPercentageRate 从高到低排序
    processedRows.sort((a, b) => {
        return parseFloat(b.latestAnnualPercentageRate) - parseFloat(a.latestAnnualPercentageRate);
    });

    return {
        rows: processedRows,
        total: processedRows.length
    };
}