import { Spot } from '@binance/spot';
import { SimpleEarn, SimpleEarnRestAPI } from '@binance/simple-earn';
import { Wallet } from '@binance/wallet';
import { Decimal } from 'decimal.js';
import { ProcessedEarnProduct, AvailableBalance } from './types';
import { delayMs } from './utils';
// 定义支持的稳定币数组
export const STABLE_COINS = ['USDT', 'USDC', 'FDUSD'];

export async function handler(API_KEY: string, API_SECRET: string) {
    const configurationRestAPI = {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
    };
    const spotClient = new Spot({ configurationRestAPI });
    const simpleEarnClient = new SimpleEarn({ configurationRestAPI });
    const walletClient = new Wallet({ configurationRestAPI });

    // 转移所有可用稳定币到现货账户中
    // const earnWalletBalance = await getEarnWalletBalance(simpleEarnClient)
    // const productIdList = Array.from(new Set(earnWalletBalance.map(item => item.productId).filter(productId => productId !== undefined)));
    // await redeemAllStableCoins(simpleEarnClient, productIdList)
    // await transferToSpot(walletClient)

    // 处理账户可用余额
    // const spotAvailableBalance: AvailableBalance = {}
    // const earnAvailableBalance: AvailableBalance = {}
    // const fundingAvailableBalance: AvailableBalance = {}
    // spotWalletBalance.forEach((item) => {
    //     spotAvailableBalance[item.asset] = new Decimal(item.free)
    // })
    // earnWalletBalance.forEach((item) => {
    //     earnAvailableBalance[item.asset] = new Decimal(item.totalAmount)
    // })
    // fundingWalletBalance.forEach((item) => {
    //     fundingAvailableBalance[item.asset] = new Decimal(item.free)
    // })

    // 查询稳定币理财产品列表
    const earnProductList = await getEarnProductList(simpleEarnClient)

    // // 处理 earnProductList 并按收益率排序
    // const processedProducts = processEarnProductList(earnProductList)

    // 依次处理每个理财产品
    // await handleEarnProducts(client, processedProducts, spotAvailableBalance, earnAvailableBalance, fundingAvailableBalance)

    return earnProductList
}

// 查询理财账户活期可用余额
async function getEarnWalletBalance(client: SimpleEarn) {
    // 并行发起所有请求
    const requests = STABLE_COINS.map(coin =>
        client.restAPI.getFlexibleProductPosition({
            asset: coin
        })
    );

    // 等待所有API请求完成
    const responses = await Promise.all(requests);

    // 等待所有response.data()调用完成
    const dataResults = await Promise.all(responses.map(res => res.data()));

    // 正确合并所有rows
    const rows = dataResults.flatMap(data => data?.rows || []);

    return rows;
}

async function redeemAllStableCoins(client: SimpleEarn, productIdList: string[]) {
    // 赎回所有活期理财
    for (const productId of productIdList) {
        await client.restAPI.redeemFlexibleProduct({
            productId,
            redeemAll: true,
        })
        // 文档上说每个账户最多三秒一次
        await delayMs(3100)
    }
}

async function transferToSpot(walletClient: Wallet) {
    // 并行查询所有稳定币的资金账户余额
    const walletResponses = await Promise.all(
        STABLE_COINS.map(coin =>
            walletClient.restAPI.fundingWallet({ asset: coin })
        )
    );

    // 并行获取所有数据
    const allBalances = await Promise.all(
        walletResponses.map(response => response.data())
    );

    // 创建并行转账请求
    const transferPromises = allBalances
        .map((balances, index) => {
            if (balances && balances.length > 0 && Number(balances[0].free) > 0) {
                return walletClient.restAPI.userUniversalTransfer({
                    type: 'FUNDING_MAIN',
                    asset: STABLE_COINS[index],
                    amount: Number(balances[0].free),
                });
            }
            return null;
        })
        .filter(Boolean);

    // 并行执行所有转账请求
    if (transferPromises.length > 0) {
        await Promise.all(transferPromises);
    }
}

// 查询稳定币理财产品列表，只包含活期产品
async function getEarnProductList(client: SimpleEarn) {
    // 查询活期产品
    const flexibleRequests = STABLE_COINS.map(coin =>
        client.restAPI.getSimpleEarnFlexibleProductList({
            asset: coin
        })
    );

    const flexibleResponses = await Promise.all(flexibleRequests);
    const flexibleDataResults = await Promise.all(flexibleResponses.map(res => res.data()));

    // 过滤掉已售罄(isSoldOut = true)的产品
    const filterNotSoldOut = (item: SimpleEarnRestAPI.GetSimpleEarnFlexibleProductListResponseRowsInner) => {
        // 检查直接属性isSoldOut
        if (item.isSoldOut === true) {
            return false;
        }
        return true;
    };

    // 过滤掉已售罄的产品
    const filteredRows = flexibleDataResults.flatMap(res => res?.rows?.filter(filterNotSoldOut) || []);

    const res = {
        rows: filteredRows,
        total: filteredRows.length
    }
    return res
}

// // 处理理财产品列表，展开 tierAnnualPercentageRate 并排序
// function processEarnProductList(earnProductList: {
//     rows: RestSimpleEarnTypes.getSimpleEarnFlexibleProductListRows[];
//     total: number;
// }) {

//     const processedRows: ProcessedEarnProduct[] = [];

//     // 处理每个产品
//     earnProductList.rows.forEach((item) => {
//         // 如果不存在 tierAnnualPercentageRate，直接添加原始项
//         if (!item.tierAnnualPercentageRate) {
//             // 创建一个不包含tierAnnualPercentageRate属性的新对象（使用类型断言避免delete的lint错误）
//             const { tierAnnualPercentageRate, ...cleanItem } = item;
//             processedRows.push(cleanItem as ProcessedEarnProduct);
//             return;
//         }

//         // 对于有 tierAnnualPercentageRate 的项目
//         // 1. 首先创建一个保留原始 latestAnnualPercentageRate 的项目（不添加额外利率）
//         const { tierAnnualPercentageRate, ...baseItem } = item;
//         processedRows.push(baseItem as ProcessedEarnProduct);

//         // 2. 为 tierAnnualPercentageRate 中的每个键值对创建单独的项目
//         Object.entries(item.tierAnnualPercentageRate).forEach(([tier, rate]) => {
//             // 创建新项，复制原始项的所有属性，但不包含tierAnnualPercentageRate
//             const { tierAnnualPercentageRate: _, ...newItem } = item;

//             // 计算新的年化收益率（原始值加上 tier 对应的值）
//             newItem.latestAnnualPercentageRate = new Decimal(item.latestAnnualPercentageRate)
//                 .plus(new Decimal(rate as string))
//                 .toString();

//             // 添加 tier 属性保存键名（使用类型断言避免tier属性不存在的错误）
//             (newItem as ProcessedEarnProduct).tier = tier;

//             // 添加到处理后的数组
//             processedRows.push(newItem as ProcessedEarnProduct);
//         });
//     });

//     // 按 latestAnnualPercentageRate 从高到低排序
//     processedRows.sort((a, b) => {
//         return new Decimal(b.latestAnnualPercentageRate).minus(new Decimal(a.latestAnnualPercentageRate)).toNumber();
//     });

//     return processedRows
// }

// // 依次处理每个理财产品
// async function handleEarnProducts(client: Spot, productList: ProcessedEarnProduct[],
//     spotAvailableBalance: AvailableBalance,
//     earnAvailableBalance: AvailableBalance,
//     fundingAvailableBalance: AvailableBalance
// ) {
//     let currentSpotAvailableBalance = spotAvailableBalance
//     let currentEarnAvailableBalance = earnAvailableBalance
//     let currentFundingAvailableBalance = fundingAvailableBalance
//     productList.forEach(async (product) => {
//         const productId = product.productId
//         const asset = product.asset
//         let requiredAmount = new Decimal(0)

//         // 检查product.tier是否存在，并解析X-YZ格式
//         if (product.tier) {
//             const tierPattern = /(\d+)-(\d+)([A-Z]+)/;
//             const match = product.tier.match(tierPattern);

//             if (match && STABLE_COINS.includes(match[3])) {
//                 const startAmount = match[1];
//                 const endAmount = match[2];
//                 requiredAmount = new Decimal(endAmount).minus(new Decimal(startAmount))
//             }

//             // 检查是否已申购足够的金额
//             // 如果这个 asset 存在，并给小于 requiredAmount，或者不存在，则申购
//             // 如果这个 asset 存在，并给大于 requiredAmount，则不赎回多余的部分
//             if (earnAvailableBalance[asset] && earnAvailableBalance[asset].lt(requiredAmount)) {
//                 // 申购
//                 await subscribeEarnProduct(client, asset, productId, requiredAmount,
//                     currentSpotAvailableBalance,
//                     currentEarnAvailableBalance,
//                     currentFundingAvailableBalance
//                 )
//                 // 更新 AvailableBalance
//                 // TODO
//             }
//             else {
//                 // 赎回 TODO
//             }

//             console.log('requiredAmount: ', requiredAmount)
//         }
//         else {
//             // 当tier不存在时，余额全部申购这个产品
//             await subscribeEarnProduct(client, asset, productId, requiredAmount,
//                 currentSpotAvailableBalance,
//                 currentEarnAvailableBalance,
//                 currentFundingAvailableBalance
//             )
//         }
//     })
// }
// // 申购理财产品
// // TODO
// async function subscribeEarnProduct(client: Spot, asset: string, productId: string, amount: Decimal,
//     spotAvailableBalance: AvailableBalance,
//     earnAvailableBalance: AvailableBalance,
//     fundingAvailableBalance: AvailableBalance
// ) {
//     let requiredAmount = amount

//     // 计算可用金额
//     let availableBalance = spotAvailableBalance[asset].plus(fundingAvailableBalance[asset])
//     // 资金量不足时，兑换后申购
//     if (availableBalance.lt(requiredAmount)) {
//         // 兑换
//         // TODO
//     }
//     // 现货账户申购
//     client.subscribeFlexibleProduct()
//     let spotSubscribeAmount = requiredAmount.minus(availableBalance)
// }