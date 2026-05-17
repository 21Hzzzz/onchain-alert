import type { Address, Hash, Hex } from "viem";
import { addressKey } from "./address.ts";
import type { InteractionEvent } from "./detector.ts";
import {
  defaultMethodNameResolver,
  isMethodBlacklisted,
  type MethodBlacklist,
  type MethodNameResolver,
} from "./methods.ts";

export type ScannableTransaction = {
  hash: Hash;
  from: Address;
  to: Address | null;
  input: Hex;
};

export type ScannableLog = {
  address: Address;
  topics: readonly Hex[];
};

export type ScannableTransactionReceipt = {
  status?: "success" | "reverted";
  logs: readonly ScannableLog[];
};

export type ScannableBlock = {
  number: bigint | null;
  timestamp: bigint | number;
  transactions: readonly ScannableTransaction[];
};

export type ContractAddressResolver = (
  address: Address,
  blockNumber: bigint,
) => Promise<boolean>;

export type TransactionReceiptResolver = (
  transactionHash: Hash,
) => Promise<ScannableTransactionReceipt>;

const EMPTY_METHOD_BLACKLIST: MethodBlacklist = {
  methodNames: new Set(),
  methodSelectors: new Set(),
};

const EMPTY_CONTRACT_SET = new Set<string>();
const ZERO_ADDRESS_TOPIC = `0x${"0".repeat(64)}` as Hex;
const ERC721_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;
const ERC1155_TRANSFER_SINGLE_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62" as Hex;
const ERC1155_TRANSFER_BATCH_TOPIC =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb" as Hex;
const ETHEREUM_OPENSEA_ASSET_BASE_URL = "https://opensea.io/assets/ethereum";

export async function extractDirectContractInteractions(
  block: ScannableBlock,
  watchedAddressKeys: ReadonlySet<string>,
  blacklistedContractKeys: ReadonlySet<string>,
  isContractAddress: ContractAddressResolver,
  resolveMethodName: MethodNameResolver = defaultMethodNameResolver,
  blacklistedMethods: MethodBlacklist = EMPTY_METHOD_BLACKLIST,
  mintRouterContractKeys: ReadonlySet<string> = EMPTY_CONTRACT_SET,
  getTransactionReceipt?: TransactionReceiptResolver,
): Promise<InteractionEvent[]> {
  if (block.number === null) {
    throw new Error("Cannot scan a pending block without a block number");
  }

  const interactions: InteractionEvent[] = [];
  const contractCache = new Map<string, boolean>();
  const timestamp = Number(block.timestamp);

  for (const transaction of block.transactions) {
    if (!watchedAddressKeys.has(addressKey(transaction.from)) || transaction.to === null) {
      continue;
    }

    const targetKey = addressKey(transaction.to);
    if (blacklistedContractKeys.has(targetKey)) {
      continue;
    }

    let isContract = contractCache.get(targetKey);

    if (isContract === undefined) {
      isContract = await isContractAddress(transaction.to, block.number);
      contractCache.set(targetKey, isContract);
    }

    if (!isContract) {
      continue;
    }

    const method = await resolveMethodName(transaction.to, transaction.input);
    if (isMethodBlacklisted(method, blacklistedMethods)) {
      continue;
    }

    const baseInteraction = {
      from: transaction.from,
      transactionHash: transaction.hash,
      methodSelector: method.methodSelector,
      methodName: method.methodName,
      blockNumber: block.number,
      timestamp,
    };

    if (mintRouterContractKeys.has(targetKey) && getTransactionReceipt !== undefined) {
      const receipt = await getTransactionReceipt(transaction.hash);
      if (receipt.status === "reverted") {
        continue;
      }

      const mintedContractAddresses = extractMintedContractAddresses(receipt);
      if (mintedContractAddresses.length > 0) {
        for (const mintedContract of mintedContractAddresses) {
          if (blacklistedContractKeys.has(addressKey(mintedContract.address))) {
            continue;
          }

          interactions.push({
            ...baseInteraction,
            contractAddress: mintedContract.address,
            openSeaUrl: openSeaAssetUrl(mintedContract.address),
          });
        }
        continue;
      }
    }

    interactions.push({
      ...baseInteraction,
      contractAddress: transaction.to,
    });
  }

  return interactions;
}

function extractMintedContractAddresses(
  receipt: ScannableTransactionReceipt,
): readonly MintedContract[] {
  const addresses = new Map<string, MintedContract>();

  for (const log of receipt.logs) {
    if (!isMintTransferLog(log)) {
      continue;
    }

    addresses.set(addressKey(log.address), {
      address: log.address,
    });
  }

  return Array.from(addresses.values());
}

type MintedContract = {
  address: Address;
};

function isMintTransferLog(log: ScannableLog): boolean {
  const eventTopic = log.topics[0]?.toLowerCase();
  if (eventTopic === ERC721_TRANSFER_TOPIC) {
    return isZeroAddressTopic(log.topics[1]);
  }

  if (eventTopic === ERC1155_TRANSFER_SINGLE_TOPIC || eventTopic === ERC1155_TRANSFER_BATCH_TOPIC) {
    return isZeroAddressTopic(log.topics[2]);
  }

  return false;
}

function isZeroAddressTopic(topic: Hex | undefined): boolean {
  return topic?.toLowerCase() === ZERO_ADDRESS_TOPIC;
}

function openSeaAssetUrl(contractAddress: Address): string {
  return `${ETHEREUM_OPENSEA_ASSET_BASE_URL}/${contractAddress}`;
}
