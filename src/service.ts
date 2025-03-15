import { Spot } from '@binance/connector-typescript';

export async function handler(API_KEY: string, API_SECRET: string) {
    const BASE_URL = 'https://api.binance.com';
    const client = new Spot(API_KEY, API_SECRET, { baseURL: BASE_URL });

    const fundingWalletBalance = await getFundingWalletBalance(client)
    const earnWalletBalance = await getEarnWalletBalance(client)
    return earnWalletBalance
}

// 获取资金账户余额
async function getFundingWalletBalance(client: Spot) {
    const accountInfo = await client.fundingWallet()
    return accountInfo;
}

// 获取理财账户活期余额
async function getEarnWalletBalance(client: Spot) {
    const accountInfo = await client.getFlexibleProductPosition()
    return accountInfo
}
