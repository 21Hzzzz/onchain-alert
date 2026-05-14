# onchain-alert

Ethereum 主网地址集体行为监控器。程序会通过 HTTP RPC 轮询新区块，当足够多的被监控地址在配置的时间窗口内直接与同一个合约交互时，向控制台打印 JSON 告警，并通过 Telegram bot 发送到指定群组。

## 安装

```bash
bun install
```

## 配置 `.env`

复制 `.env.example` 为 `.env`，并填写 Ethereum HTTP RPC、Etherscan 和 Telegram 配置：

```env
ETH_RPC_HTTP_URL=https://your-ethereum-rpc.example
ETHERSCAN_API_KEY=your-etherscan-api-key
TELEGRAM_BOT_TOKEN=123456:your-telegram-bot-token
TELEGRAM_CHAT_ID=-1001234567890
```

字段含义：

- `ETH_RPC_HTTP_URL`：Ethereum 主网 HTTP RPC 地址。
- `ETHERSCAN_API_KEY`：Etherscan API key，用于按合约地址拉取已验证合约 ABI 并解析方法名。
- `TELEGRAM_BOT_TOKEN`：Telegram BotFather 提供的 bot token。
- `TELEGRAM_CHAT_ID`：接收告警的群组或频道 chat id。

程序启动时会读取 `.env`。如果系统环境变量里也设置了同名字段，系统环境变量会覆盖 `.env` 中的值。

## 配置监控参数

编辑 `config.json`：

```json
{
  "windowMinutes": 5,
  "minUniqueAddresses": 3,
  "pollIntervalMs": 12000,
  "addressBookPath": "addresses.txt"
}
```

配置字段含义：

- `windowMinutes`：滑动时间窗口，单位为分钟。
- `minUniqueAddresses`：触发告警所需的不同观察地址数量。
- `pollIntervalMs`：轮询最新区块的间隔，单位为毫秒。
- `addressBookPath`：观察地址和合约黑名单文件路径，默认是 `addresses.txt`。

## 地址文件

编辑 `addresses.txt`。文件使用分节格式，每行一个地址和一个可选备注，地址和备注用英文逗号隔开：

```txt
[watchedAddresses]
0x0000000000000000000000000000000000000001,团队钱包 A
0x0000000000000000000000000000000000000002

[blacklistedContracts]
0xdAC17F958D2ee523a2206206994597C13D831ec7,USDT
0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,USDC
```

规则：

- 必须包含 `[watchedAddresses]` 和 `[blacklistedContracts]` 两个分节。
- 空行和 `#` 开头的整行注释会被忽略。
- 备注可以省略；如果备注中还有逗号，只有第一个逗号用于分隔地址。
- 重复地址会按大小写无关去重，后出现的备注覆盖前面的备注。
- `watchedAddresses` 必须至少有一个地址；`blacklistedContracts` 可以为空。

默认 `addresses.txt` 已加入一些 Ethereum 主网常见黑名单合约，包括 USDT、USDC、DAI、WETH、Uniswap 路由、Permit2、0x、1inch、CoW Protocol、Balancer、ParaSwap 等。你可以按需要继续追加或删除。

## 启动自检

每次运行 `bun run start` 后，程序会先执行启动自检：

- RPC：确认 RPC 连接可用、链 ID 是 Ethereum mainnet `1`，并能读取最新区块号。
- Etherscan：用 `ETHERSCAN_API_KEY` 拉取 WETH 的已验证合约 ABI，确认 API key 和网络正常。
- Telegram：向 `TELEGRAM_CHAT_ID` 发送一条启动自检消息，确认 bot token、chat id 和推送权限正常。

任意一项失败，程序会打印错误并以非 0 状态退出，不会进入区块扫描。

## Telegram 告警

Telegram 消息会包含：

- 合约地址的 Etherscan 可点击链接。
- 窗口大小、触发阈值和参与地址数量。
- 首次交互时间和最近交互时间，格式为 `UTC+8`。
- 触发区块的 Etherscan 可点击链接。
- 参与观察地址列表，显示完整地址，并在地址后显示调用方法名。
- 方法名优先来自 Etherscan 上该合约的 ABI；如果 ABI 不可用或 selector 不在 ABI 中，会使用内置常见方法表，否则显示为 `unknown(0x...)`。

控制台仍会打印完整 JSON 告警，便于本地排查。

## 运行

```bash
bun run start
```

## 检查代码

```bash
bun run typecheck
bun test
```
