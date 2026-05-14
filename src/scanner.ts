import type { Address, Hash, Hex } from "viem";
import { addressKey } from "./address.ts";
import type { InteractionEvent } from "./detector.ts";
import { defaultMethodNameResolver, type MethodNameResolver } from "./methods.ts";

export type ScannableTransaction = {
  hash: Hash;
  from: Address;
  to: Address | null;
  input: Hex;
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

export async function extractDirectContractInteractions(
  block: ScannableBlock,
  watchedAddressKeys: ReadonlySet<string>,
  blacklistedContractKeys: ReadonlySet<string>,
  isContractAddress: ContractAddressResolver,
  resolveMethodName: MethodNameResolver = defaultMethodNameResolver,
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

    interactions.push({
      contractAddress: transaction.to,
      from: transaction.from,
      transactionHash: transaction.hash,
      methodSelector: method.methodSelector,
      methodName: method.methodName,
      blockNumber: block.number,
      timestamp,
    });
  }

  return interactions;
}
