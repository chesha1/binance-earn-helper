import { Spot, RestSimpleEarnTypes } from '@binance/connector-typescript';
import { Decimal } from 'decimal.js';
import { ProcessedEarnProduct } from './types';

// 定义支持的稳定币数组
export const STABLE_COINS = ['USDT', 'USDC', 'FDUSD'];

export async function handler(API_KEY: string, API_SECRET: string) {
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
    const earnProductList = await getEarnProductList(client)

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

    // 合并所有响应的 rows
    const rows = responses.flatMap(res => res.rows);

    const res = {
        rows: rows,
        total: rows.length
    }
    return res
}

// 查询稳定币理财产品列表，只包含活期产品
async function getEarnProductList(client: Spot) {
    // 查询活期产品
    const flexibleRequests = STABLE_COINS.map(coin =>
        client.getSimpleEarnFlexibleProductList({
            asset: coin
        })
    );

    const flexibleResponses = await Promise.all(flexibleRequests);

    // 过滤掉已售罄(isSoldOut = true)的产品
    const filterNotSoldOut = (item: RestSimpleEarnTypes.getSimpleEarnFlexibleProductListRows) => {
        // 检查直接属性isSoldOut
        if (item.isSoldOut === true) {
            return false;
        }
        return true;
    };

    // 过滤掉已售罄的产品
    const filteredRows = flexibleResponses.flatMap(res => res.rows.filter(filterNotSoldOut));

    const res = {
        rows: filteredRows,
        total: filteredRows.length
    }
    return res
}

// 处理理财产品列表，展开 tierAnnualPercentageRate 并排序
function processEarnProductList(earnProductList: {
    rows: RestSimpleEarnTypes.getSimpleEarnFlexibleProductListRows[];
    total: number;
}) {

    const processedRows: ProcessedEarnProduct[] = [];

    // 处理每个产品
    earnProductList.rows.forEach((item) => {
        // 如果不存在 tierAnnualPercentageRate，直接添加原始项
        if (!item.tierAnnualPercentageRate) {
            // 创建一个不包含tierAnnualPercentageRate属性的新对象（使用类型断言避免delete的lint错误）
            const { tierAnnualPercentageRate, ...cleanItem } = item;
            processedRows.push(cleanItem as ProcessedEarnProduct);
            return;
        }

        // 对于有 tierAnnualPercentageRate 的项目
        // 1. 首先创建一个保留原始 latestAnnualPercentageRate 的项目（不添加额外利率）
        const { tierAnnualPercentageRate, ...baseItem } = item;
        processedRows.push(baseItem as ProcessedEarnProduct);

        // 2. 为 tierAnnualPercentageRate 中的每个键值对创建单独的项目
        Object.entries(item.tierAnnualPercentageRate).forEach(([tier, rate]) => {
            // 创建新项，复制原始项的所有属性，但不包含tierAnnualPercentageRate
            const { tierAnnualPercentageRate: _, ...newItem } = item;

            // 计算新的年化收益率（原始值加上 tier 对应的值）
            newItem.latestAnnualPercentageRate = new Decimal(item.latestAnnualPercentageRate)
                .plus(new Decimal(rate as string))
                .toString();

            // 添加 tier 属性保存键名（使用类型断言避免tier属性不存在的错误）
            (newItem as ProcessedEarnProduct).tier = tier;

            // 添加到处理后的数组
            processedRows.push(newItem as ProcessedEarnProduct);
        });
    });

    // 按 latestAnnualPercentageRate 从高到低排序
    processedRows.sort((a, b) => {
        return new Decimal(b.latestAnnualPercentageRate).minus(new Decimal(a.latestAnnualPercentageRate)).toNumber();
    });

    return {
        rows: processedRows,
        total: processedRows.length
    };
}