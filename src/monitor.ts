import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { buildWatchedAddressSet } from "./address.ts";
import { buildAddressRemarkMap } from "./addressBook.ts";
import { findBackfillStartBlock } from "./backfill.ts";
import type { MonitorConfig } from "./config.ts";
import { CollectiveInteractionDetector } from "./detector.ts";
import { createEtherscanMethodResolver } from "./etherscan.ts";
import { runStartupHealthChecks } from "./health.ts";
import { buildMethodBlacklist, type MethodBlacklist } from "./methods.ts";
import { formatAlertForConsole } from "./output.ts";
import {
  extractDirectContractInteractions,
  type TransactionReceiptResolver,
} from "./scanner.ts";
import { sendTelegramAlert, type TelegramConfig } from "./telegram.ts";

type EthereumPublicClient = ReturnType<typeof createPublicClient>;
type ProcessBlockResult = {
  interactionCount: number;
  alertCount: number;
};

export async function runMonitor(config: MonitorConfig): Promise<void> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(config.rpcUrl),
  });
  const watchedAddressKeys = buildWatchedAddressSet(config.watchedAddresses);
  const blacklistedContractKeys = buildWatchedAddressSet(config.blacklistedContracts);
  const mintRouterContractKeys = buildWatchedAddressSet(config.mintRouterContracts);
  const blacklistedMethods = buildMethodBlacklist(config.blacklistedMethods);
  const addressRemarks = buildAddressRemarkMap(config.watchedAddresses);
  const detector = new CollectiveInteractionDetector({
    windowSeconds: config.windowSeconds,
    alertCooldownSeconds: config.alertCooldownSeconds,
    minUniqueAddresses: config.minUniqueAddresses,
    addressRemarks,
  });
  const telegramConfig: TelegramConfig = {
    botToken: config.telegramBotToken,
    chatId: config.telegramChatId,
  };
  const resolveMethodName = createEtherscanMethodResolver({
    apiKey: config.etherscanApiKey,
    chainId: 1,
  });
  const isContractAddress = createContractCodeResolver(client);
  const getTransactionReceipt = createTransactionReceiptResolver(client);

  const { latestBlockNumber } = await runStartupHealthChecks({
    client,
    config: {
      etherscanApiKey: config.etherscanApiKey,
      telegram: telegramConfig,
    },
  });
  const startBlockNumber = await findBackfillStartBlock(
    client,
    latestBlockNumber,
    config.windowSeconds,
  );

  console.info(
    `Starting Ethereum monitor from block ${startBlockNumber.toString()} through latest ${latestBlockNumber.toString()}`,
  );

  let nextBlockNumber = startBlockNumber;

  while (true) {
    const currentLatestBlockNumber = await client.getBlockNumber();

    while (nextBlockNumber <= currentLatestBlockNumber) {
      const result = await processBlock({
        client,
        blockNumber: nextBlockNumber,
        watchedAddressKeys,
        blacklistedContractKeys,
        mintRouterContractKeys,
        blacklistedMethods,
        detector,
        telegramConfig,
        resolveMethodName,
        isContractAddress,
        getTransactionReceipt,
      });
      console.info(
        `Scanned block ${nextBlockNumber.toString()} / latest ${currentLatestBlockNumber.toString()} | interactions=${result.interactionCount} alerts=${result.alertCount}`,
      );
      nextBlockNumber += 1n;
    }

    await sleep(config.pollIntervalMs);
  }
}

async function processBlock({
  client,
  blockNumber,
  watchedAddressKeys,
  blacklistedContractKeys,
  mintRouterContractKeys,
  blacklistedMethods,
  detector,
  telegramConfig,
  resolveMethodName,
  isContractAddress,
  getTransactionReceipt,
}: {
  client: EthereumPublicClient;
  blockNumber: bigint;
  watchedAddressKeys: ReadonlySet<string>;
  blacklistedContractKeys: ReadonlySet<string>;
  mintRouterContractKeys: ReadonlySet<string>;
  blacklistedMethods: MethodBlacklist;
  detector: CollectiveInteractionDetector;
  telegramConfig: TelegramConfig;
  resolveMethodName: Parameters<typeof extractDirectContractInteractions>[4];
  isContractAddress: (address: Address, blockNumber: bigint) => Promise<boolean>;
  getTransactionReceipt: TransactionReceiptResolver;
}): Promise<ProcessBlockResult> {
  const block = await client.getBlock({
    blockNumber,
    includeTransactions: true,
  });
  const blockTimestamp = Number(block.timestamp);
  const interactions = await extractDirectContractInteractions(
    block,
    watchedAddressKeys,
    blacklistedContractKeys,
    isContractAddress,
    resolveMethodName,
    blacklistedMethods,
    mintRouterContractKeys,
    getTransactionReceipt,
  );
  const alerts = detector.recordInteractions(interactions, blockTimestamp);

  for (const alert of alerts) {
    console.log(formatAlertForConsole(alert));
    try {
      await sendTelegramAlert(telegramConfig, alert);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    interactionCount: interactions.length,
    alertCount: alerts.length,
  };
}

function createContractCodeResolver(client: EthereumPublicClient) {
  return async function isContractAddress(address: Address, blockNumber: bigint): Promise<boolean> {
    const bytecode = await client.getBytecode({
      address,
      blockNumber,
    });
    return bytecode !== undefined && bytecode !== "0x";
  };
}

function createTransactionReceiptResolver(client: EthereumPublicClient): TransactionReceiptResolver {
  return async function getTransactionReceipt(transactionHash) {
    const receipt = await client.getTransactionReceipt({
      hash: transactionHash,
    });

    return {
      status: receipt.status,
      logs: receipt.logs.map((log) => ({
        address: log.address,
        topics: log.topics,
      })),
    };
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
