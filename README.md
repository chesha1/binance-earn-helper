# binance-earn-helper
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/chesha1/binance-earn-helper)

币安理财助手，自动调整到利率最高的稳定币理财上

不处理定期了，只处理活期，因为定期可能会影响资金灵活性，所以请手动操作

~~并不是币安的 API 设计的不好，定期活期的类型混在一起太麻烦才不写的~~

```mermaid
graph TD
    productRanking["利率从高到低满足理财产品"]
    subscribeProduct["申购理财"]
    convertAllToUSDT["全部兑换成USDT"]
    isProductUSDT{"理财产品是否是USDT"}
    purchaseAttempt{"尝试购买对应币"}
    scanAllProducts["扫描所有理财产品"]
    redeemToSpot["调整（赎回）全部可用余额到现货账户"]
    directSubscribe["直接申购"]
    endProcess["用剩下的USDT余额买，流程结束"]
    remainingBalanceSubscribe["现货账户中剩余的余额申购理财"]

    productRanking --- isProductUSDT
    isProductUSDT ---|否| purchaseAttempt
    scanAllProducts --- productRanking
    redeemToSpot --- convertAllToUSDT
    convertAllToUSDT --- scanAllProducts
    subscribeProduct --- productRanking
    purchaseAttempt ---|余额充足，够买成功| subscribeProduct
    isProductUSDT ---|是| directSubscribe
    directSubscribe --- productRanking
    purchaseAttempt ---|余额不足| endProcess
    endProcess --- remainingBalanceSubscribe

```
BTCUSDT

`BUY` side, 用 `quoteOrderQty` USDT 买入，或者买入 `quantity` 个 BTC
`SELL` side, 卖出得到 `quoteOrderQty` USDT，或者卖出 `quantity` 个 BTC

## TODO
### 固定执行位置
ConnectorClientError: Service unavailable from a restricted location according to 'b. Eligibility' in https://www.binance.com/en/terms. Please contact customer service if you believe you received this message in error.
    at httpRequestFunction (index-cf.js:14785:21)
    at async Promise.all (index 2)
    at async getEarnWalletBalance (index-cf.js:23944:21)
    at async prepareBalance (index-cf.js:23775:29)
    at async handler (index-cf.js:23742:5)
    at async Object.scheduled (index-cf.js:24103:5)