import { Spot } from '@binance/spot';
import { SimpleEarn, SimpleEarnRestAPI } from '@binance/simple-earn';
import { Wallet } from '@binance/wallet';
import { Decimal } from 'decimal.js';
import { ProcessedEarnProduct, AvailableBalance, Clients } from './types';
import { delayMs } from './utils';
// 定义支持的稳定币数组
export const STABLE_COINS = ['USDT', 'USDC', 'FDUSD'];

// 定义常量
const MIN_SUBSCRIBE_AMOUNT = 0.1; // 申购的最小金额
const MIN_NOTIONAL_AMOUNT = 5; // newOrder的minNotional要求
const API_DELAY_MS = 3000; // 服务端请求频率要求延迟
const DEFAULT_PRODUCT_SUFFIX = '001'; // 默认产品ID后缀

// 主处理函数
export async function handler(API_KEY: string, API_SECRET: string) {
    // 初始化客户端
    const clients = initializeClients(API_KEY, API_SECRET);

    // 准备余额
    await prepareBalance(clients);

    // 获取并处理理财产品列表
    const processedProducts = await getProcessedEarnProducts(clients.simpleEarnClient);

    // 申购理财产品
    await subscribeToProducts(processedProducts, clients);

    // 为现货账户中残留的币申购理财产品
    await subscribeRemainingBalances(clients.simpleEarnClient, clients.walletClient);

    return 'success';
}

// 初始化所有客户端
function initializeClients(API_KEY: string, API_SECRET: string): Clients {
    const configurationRestAPI = {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
    };

    return {
        spotClient: new Spot({ configurationRestAPI }),
        simpleEarnClient: new SimpleEarn({ configurationRestAPI }),
        walletClient: new Wallet({ configurationRestAPI }),
    };
}

// 准备余额：赎回所有理财产品，转移到现货账户，并兑换为USDT
async function prepareBalance(clients: Clients) {
    const { simpleEarnClient, walletClient, spotClient } = clients;

    // 转移所有可用稳定币到现货账户中
    const earnWalletBalance = await getEarnWalletBalance(simpleEarnClient);
    const productIdList = Array.from(new Set(earnWalletBalance.map(item => item.productId).filter(productId => productId !== undefined)));

    await redeemAllStableCoins(simpleEarnClient, productIdList);
    await transferToSpot(walletClient);
    await convertAllToUSDT(spotClient, walletClient);
}

// 获取并处理理财产品列表
async function getProcessedEarnProducts(simpleEarnClient: SimpleEarn): Promise<ProcessedEarnProduct[]> {
    const earnProductList = await getEarnProductList(simpleEarnClient);
    return processEarnProductList(earnProductList);
}

// 申购单个理财产品
async function subscribeToProduct(
    product: ProcessedEarnProduct,
    availableUSDT: Decimal,
    clients: Clients
): Promise<boolean> {
    // 如果有 requiredAmount，则买入固定的量
    if (product.requiredAmount) {
        return await handleRequiredAmountProduct(product, availableUSDT, clients);
    } else {
        // 没有 requiredAmount，则买入全部的量，申购然后结束
        return await handleUnlimitedProduct(product, availableUSDT, clients);
    }
}

// 处理有固定申购金额的产品
async function handleRequiredAmountProduct(
    product: ProcessedEarnProduct,
    availableUSDT: Decimal,
    clients: Clients
): Promise<boolean> {
    const { spotClient, simpleEarnClient, walletClient } = clients;
    const asset = product.asset;
    const requiredAmount = product.requiredAmount!;

    // 如果是 USDT，则不买入直接申购
    if (asset === 'USDT') {
        await simpleEarnClient.restAPI.subscribeFlexibleProduct({
            productId: product.productId,
            amount: requiredAmount.toNumber(),
        });
        await delayMs(API_DELAY_MS);
        return false; // 继续处理下一个产品
    }

    // 不是USDT，买入对应量的货币并申购
    try {
        await spotClient.restAPI.newOrder({
            symbol: `${asset}USDT`,
            side: 'BUY',
            type: 'MARKET',
            quantity: Math.floor(requiredAmount.toNumber()),
        });
        await simpleEarnClient.restAPI.subscribeFlexibleProduct({
            productId: product.productId,
            amount: Math.floor(requiredAmount.toNumber()),
        });
        await delayMs(API_DELAY_MS);
        return false; // 继续处理下一个产品
    } catch (error) {
        // USDT 量不够了，买完申购完结束
        if (error instanceof Error && error.message.includes('insufficient balance')) {
            await spotClient.restAPI.newOrder({
                symbol: `${asset}USDT`,
                side: 'BUY',
                type: 'MARKET',
                quoteOrderQty: Math.floor(availableUSDT.toNumber()),
            });
        }
        const availableBalance = (await getSpotBalance(walletClient))[asset];
        await simpleEarnClient.restAPI.subscribeFlexibleProduct({
            productId: product.productId,
            amount: availableBalance.toNumber(),
        });
        await delayMs(API_DELAY_MS);
        return true; // 中断循环
    }
}

// 处理无限制申购金额的产品
async function handleUnlimitedProduct(
    product: ProcessedEarnProduct,
    availableUSDT: Decimal,
    clients: Clients
): Promise<boolean> {
    const { spotClient, simpleEarnClient, walletClient } = clients;
    const asset = product.asset;

    // 如果是 USDT，则不买入直接申购
    if (asset === 'USDT') {
        await simpleEarnClient.restAPI.subscribeFlexibleProduct({
            productId: product.productId,
            amount: availableUSDT.toNumber(),
        });
        await delayMs(API_DELAY_MS);
        return true; // 中断循环
    }

    await spotClient.restAPI.newOrder({
        symbol: `${asset}USDT`,
        side: 'BUY',
        type: 'MARKET',
        quoteOrderQty: Math.floor(availableUSDT.toNumber()),
    });
    const availableBalance = (await getSpotBalance(walletClient))[asset];
    await simpleEarnClient.restAPI.subscribeFlexibleProduct({
        productId: product.productId,
        amount: availableBalance.toNumber(),
    });
    await delayMs(API_DELAY_MS);
    return true; // 中断循环
}

// 申购所有理财产品
async function subscribeToProducts(processedProducts: ProcessedEarnProduct[], clients: Clients) {
    const { walletClient } = clients;

    for (const product of processedProducts) {
        const availableUSDT = (await getSpotBalance(walletClient)).USDT;
        const shouldBreak = await subscribeToProduct(product, availableUSDT, clients);

        if (shouldBreak) {
            break;
        }
    }
}

// 申购残留的币种
async function subscribeRemainingBalances(simpleEarnClient: SimpleEarn, walletClient: Wallet) {
    const availableBalance = await getSpotBalance(walletClient);

    for (const asset in availableBalance) {
        // 金额不可低于最小申购金额
        if (availableBalance[asset].lt(new Decimal(MIN_SUBSCRIBE_AMOUNT))) {
            continue;
        }
        await simpleEarnClient.restAPI.subscribeFlexibleProduct({
            productId: `${asset}${DEFAULT_PRODUCT_SUFFIX}`,
            amount: availableBalance[asset].toNumber(),
        });
        await delayMs(API_DELAY_MS);
    }
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

// 赎回所有活期理财
async function redeemAllStableCoins(client: SimpleEarn, productIdList: string[]) {
    for (const productId of productIdList) {
        await client.restAPI.redeemFlexibleProduct({
            productId,
            redeemAll: true,
        })
        // 文档上说每个账户最多三秒一次
        await delayMs(API_DELAY_MS)
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

// 处理理财产品列表，展开 tierAnnualPercentageRate 并排序
// 如果没有阶梯，就不存在 requiredAmount 这个属性
function processEarnProductList(earnProductList: {
    rows: SimpleEarnRestAPI.GetSimpleEarnFlexibleProductListResponseRowsInner[];
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
            newItem.latestAnnualPercentageRate = new Decimal(item.latestAnnualPercentageRate || 0)
                .plus(new Decimal(rate as string))
                .toString();

            // 解析tier格式并计算requiredAmount
            const tierPattern = /(\d+)-(\d+)([A-Z]+)/;
            const match = tier.match(tierPattern);

            if (match && STABLE_COINS.includes(match[3])) {
                const startAmount = match[1];
                const endAmount = match[2];
                (newItem as ProcessedEarnProduct).requiredAmount = new Decimal(endAmount).minus(new Decimal(startAmount));
            }

            // 添加到处理后的数组
            processedRows.push(newItem as ProcessedEarnProduct);
        });
    });

    // 按 latestAnnualPercentageRate 从高到低排序
    processedRows.sort((a, b) => {
        return new Decimal(b.latestAnnualPercentageRate).minus(new Decimal(a.latestAnnualPercentageRate)).toNumber();
    });

    return processedRows
}

// 查询现货账户稳定币余额
async function getSpotBalance(client: Wallet): Promise<AvailableBalance> {
    const balanceRequests = STABLE_COINS.map(coin =>
        client.restAPI.userAsset({
            asset: coin
        })
    );

    // 等待所有API请求完成
    const responses = await Promise.all(balanceRequests);

    // 等待所有响应数据
    const dataResults = await Promise.all(responses.map(res => res.data()));

    // 创建结果对象
    const result: AvailableBalance = {};

    // 提取每种稳定币的free值
    dataResults.forEach((data, index) => {
        if (data && data.length > 0) {
            const coin = STABLE_COINS[index];
            result[coin] = new Decimal(data[0].free || '0');
        }
    });

    return result;
}

// 将所有稳定币兑换成 USDT
// 因为只有有限的 symbol，比如只有 USDCUSDT，没有 USDTUSDC
async function convertAllToUSDT(spotClient: Spot, walletClient: Wallet) {
    // 获取当前余额
    const balance = await getSpotBalance(walletClient);

    // 收集所有兑换操作
    const exchangePromises = STABLE_COINS
        .filter(coin => coin !== 'USDT') // 过滤掉USDT
        .map(coin => {
            const coinBalance = balance[coin];

            // 如果当前币种有余额，进行兑换
            // minNotional 要求为 MIN_NOTIONAL_AMOUNT，所以会剩下小于该值的余额不处理
            if (coinBalance && coinBalance.gt(new Decimal(MIN_NOTIONAL_AMOUNT))) {
                return spotClient.restAPI.newOrder({
                    symbol: `${coin}USDT`,
                    side: 'SELL',
                    type: 'MARKET',
                    quantity: Math.floor(coinBalance.toNumber()), // LOT_SIZE 步长为 1，所以要向下取整
                }).catch(error => {
                    console.error(`兑换 ${coin} 到 USDT 失败:`, error);
                    // 返回null，不影响其他转换操作
                    return null;
                });
            }
            // 如果余额不足，返回resolved promise
            return Promise.resolve(null);
        });

    // 并行执行所有兑换操作
    await Promise.all(exchangePromises);
}