import type { Address } from "viem";
import { fetchContractAbi } from "./etherscan.ts";
import { sendTelegramMessage, type TelegramConfig } from "./telegram.ts";

export type StartupHealthConfig = {
  etherscanApiKey: string;
  telegram: TelegramConfig;
};

export type StartupHealthResult = {
  latestBlockNumber: bigint;
};

export type StartupHealthDependencies = {
  fetchContractAbi?: typeof fetchContractAbi;
  sendTelegramMessage?: typeof sendTelegramMessage;
};

type RpcHealthClient = {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
};

const ETHEREUM_MAINNET_CHAIN_ID = 1;
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address;

export async function runStartupHealthChecks({
  client,
  config,
  dependencies = {},
}: {
  client: RpcHealthClient;
  config: StartupHealthConfig;
  dependencies?: StartupHealthDependencies;
}): Promise<StartupHealthResult> {
  console.info("Running startup checks...");

  const latestBlockNumber = await validateRpc(client);
  console.info(`RPC check ok: latest block ${latestBlockNumber.toString()}`);

  await validateEtherscan(config.etherscanApiKey, dependencies.fetchContractAbi ?? fetchContractAbi);
  console.info("Etherscan API check ok");

  await validateTelegram(
    config.telegram,
    latestBlockNumber,
    dependencies.sendTelegramMessage ?? sendTelegramMessage,
  );
  console.info("Telegram push check ok");

  return {
    latestBlockNumber,
  };
}

async function validateRpc(client: RpcHealthClient): Promise<bigint> {
  const chainId = await client.getChainId();
  if (chainId !== ETHEREUM_MAINNET_CHAIN_ID) {
    throw new Error(`RPC check failed: expected chainId 1, got ${chainId}`);
  }

  const latestBlockNumber = await client.getBlockNumber();
  if (latestBlockNumber < 0n) {
    throw new Error("RPC check failed: latest block number is invalid");
  }

  return latestBlockNumber;
}

async function validateEtherscan(
  apiKey: string,
  fetchAbi: typeof fetchContractAbi,
): Promise<void> {
  const abi = await fetchAbi(WETH_ADDRESS, {
    apiKey,
    chainId: ETHEREUM_MAINNET_CHAIN_ID,
  });

  if (abi === undefined || abi.length === 0) {
    throw new Error("Etherscan API check failed: WETH ABI was not returned");
  }
}

async function validateTelegram(
  telegramConfig: TelegramConfig,
  latestBlockNumber: bigint,
  sendMessage: typeof sendTelegramMessage,
): Promise<void> {
  await sendMessage(telegramConfig, {
    text: `Onchain monitor startup check OK\nLatest Ethereum block: ${latestBlockNumber.toString()}`,
    disableWebPagePreview: true,
  });
}
