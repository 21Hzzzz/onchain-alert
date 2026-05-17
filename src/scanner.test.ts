import { describe, expect, test } from "bun:test";
import type { Address, Hash, Hex } from "viem";
import { buildWatchedAddressSet } from "./address.ts";
import { buildMethodBlacklist } from "./methods.ts";
import {
  extractDirectContractInteractions,
  type ScannableLog,
  type ScannableTransaction,
  type ScannableTransactionReceipt,
} from "./scanner.ts";

const WATCHED_ONE = "0x0000000000000000000000000000000000000001" as Address;
const WATCHED_TWO = "0x0000000000000000000000000000000000000002" as Address;
const UNWATCHED = "0x0000000000000000000000000000000000000003" as Address;
const CONTRACT = "0x00000000000000000000000000000000000000aa" as Address;
const EOA = "0x00000000000000000000000000000000000000bb" as Address;
const ROUTER = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5" as Address;
const NFT_ONE = "0x0000000000000000000000000000000000000c01" as Address;
const NFT_TWO = "0x0000000000000000000000000000000000000c02" as Address;
const ZERO_ADDRESS_TOPIC = `0x${"0".repeat(64)}` as Hex;
const ERC721_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;
const ERC1155_TRANSFER_SINGLE_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62" as Hex;
const ERC1155_TRANSFER_BATCH_TOPIC =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb" as Hex;

describe("extractDirectContractInteractions", () => {
  test("keeps only watched direct transactions to contracts", async () => {
    const watched = buildWatchedAddressSet([WATCHED_ONE, WATCHED_TWO]);
    const resolverCalls: string[] = [];

    const interactions = await extractDirectContractInteractions(
      {
        number: 100n,
        timestamp: 1000n,
        transactions: [
          tx(1, WATCHED_ONE, CONTRACT),
          tx(2, UNWATCHED, CONTRACT),
          tx(3, WATCHED_ONE, null),
          tx(4, WATCHED_TWO, EOA),
        ],
      },
      watched,
      new Set(),
      async (address) => {
        resolverCalls.push(address);
        return address === CONTRACT;
      },
    );

    expect(interactions).toHaveLength(1);
    expect(interactions[0]).toMatchObject({
      contractAddress: CONTRACT,
      from: WATCHED_ONE,
      transactionHash: hash(1),
      methodSelector: "0x40c10f19",
      methodName: "mint",
      blockNumber: 100n,
      timestamp: 1000,
    });
    expect(resolverCalls).toEqual([CONTRACT, EOA]);
  });

  test("caches contract lookups within a block", async () => {
    const watched = buildWatchedAddressSet([WATCHED_ONE, WATCHED_TWO]);
    let resolverCallCount = 0;

    const interactions = await extractDirectContractInteractions(
      {
        number: 100n,
        timestamp: 1000n,
        transactions: [tx(1, WATCHED_ONE, CONTRACT), tx(2, WATCHED_TWO, CONTRACT)],
      },
      watched,
      new Set(),
      async () => {
        resolverCallCount += 1;
        return true;
      },
    );

    expect(interactions).toHaveLength(2);
    expect(resolverCallCount).toBe(1);
  });

  test("ignores blacklisted contract targets before resolving bytecode", async () => {
    const interactions = await extractDirectContractInteractions(
      {
        number: 100n,
        timestamp: 1000n,
        transactions: [tx(1, WATCHED_ONE, CONTRACT)],
      },
      buildWatchedAddressSet([WATCHED_ONE]),
      buildWatchedAddressSet([CONTRACT]),
      async () => {
        throw new Error("blacklisted contract should not be resolved");
      },
    );

    expect(interactions).toEqual([]);
  });

  test("accepts non-blacklisted contract targets", async () => {
    const interactions = await extractDirectContractInteractions(
      {
        number: 100n,
        timestamp: 1000n,
        transactions: [tx(1, WATCHED_ONE, CONTRACT)],
      },
      buildWatchedAddressSet([WATCHED_ONE]),
      buildWatchedAddressSet([EOA]),
      async () => true,
    );

    expect(interactions).toHaveLength(1);
  });

  test("ignores blacklisted methods after resolving method names", async () => {
    const interactions = await extractDirectContractInteractions(
      {
        number: 100n,
        timestamp: 1000n,
        transactions: [
          tx(1, WATCHED_ONE, CONTRACT, "0xa22cb4650000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001"),
          tx(2, WATCHED_TWO, CONTRACT),
        ],
      },
      buildWatchedAddressSet([WATCHED_ONE, WATCHED_TWO]),
      new Set(),
      async () => true,
      async (_contractAddress, input) =>
        input.startsWith("0xa22cb465")
          ? {
              methodSelector: "0xa22cb465",
              methodName: "setApprovalForAll",
            }
          : {
              methodSelector: "0x40c10f19",
              methodName: "Mint",
            },
      buildMethodBlacklist(["setApprovalForAll"]),
    );

    expect(interactions).toHaveLength(1);
    expect(interactions[0]?.from).toBe(WATCHED_TWO);
  });

  test("routes ERC721 mint router transactions to minted NFT contracts", async () => {
    const interactions = await extractDirectContractInteractions(
      {
        number: 100n,
        timestamp: 1000n,
        transactions: [tx(1, WATCHED_ONE, ROUTER)],
      },
      buildWatchedAddressSet([WATCHED_ONE]),
      new Set(),
      async () => true,
      async () => ({
        methodSelector: "0x1249c58b",
        methodName: "mint",
      }),
      buildMethodBlacklist([]),
      buildWatchedAddressSet([ROUTER]),
      async () => receipt([erc721MintLog(NFT_ONE, WATCHED_ONE)]),
    );

    expect(interactions).toHaveLength(1);
    expect(interactions[0]).toMatchObject({
      contractAddress: NFT_ONE,
      from: WATCHED_ONE,
      transactionHash: hash(1),
      methodSelector: "0x1249c58b",
      methodName: "mint",
    });
  });

  test("routes ERC1155 mint router transactions to each minted NFT contract", async () => {
    const interactions = await extractDirectContractInteractions(
      {
        number: 100n,
        timestamp: 1000n,
        transactions: [tx(1, WATCHED_ONE, ROUTER)],
      },
      buildWatchedAddressSet([WATCHED_ONE]),
      new Set(),
      async () => true,
      async () => ({
        methodSelector: "0x1249c58b",
        methodName: "mint",
      }),
      buildMethodBlacklist([]),
      buildWatchedAddressSet([ROUTER]),
      async () =>
        receipt([
          erc1155TransferSingleMintLog(NFT_ONE, WATCHED_ONE),
          erc1155TransferBatchMintLog(NFT_TWO, WATCHED_ONE),
        ]),
    );

    expect(interactions.map((interaction) => interaction.contractAddress)).toEqual([
      NFT_ONE,
      NFT_TWO,
    ]);
  });

  test("deduplicates minted NFT contracts within one router transaction", async () => {
    const interactions = await extractDirectContractInteractions(
      {
        number: 100n,
        timestamp: 1000n,
        transactions: [tx(1, WATCHED_ONE, ROUTER)],
      },
      buildWatchedAddressSet([WATCHED_ONE]),
      new Set(),
      async () => true,
      async () => ({
        methodSelector: "0x1249c58b",
        methodName: "mint",
      }),
      buildMethodBlacklist([]),
      buildWatchedAddressSet([ROUTER]),
      async () =>
        receipt([
          erc721MintLog(NFT_ONE, WATCHED_ONE),
          erc721MintLog(NFT_ONE, WATCHED_ONE, 2n),
        ]),
    );

    expect(interactions.map((interaction) => interaction.contractAddress)).toEqual([NFT_ONE]);
  });

  test("falls back to router contract when a router receipt has no mint events", async () => {
    const interactions = await extractDirectContractInteractions(
      {
        number: 100n,
        timestamp: 1000n,
        transactions: [tx(1, WATCHED_ONE, ROUTER)],
      },
      buildWatchedAddressSet([WATCHED_ONE]),
      new Set(),
      async () => true,
      async () => ({
        methodSelector: "0x1249c58b",
        methodName: "mint",
      }),
      buildMethodBlacklist([]),
      buildWatchedAddressSet([ROUTER]),
      async () => receipt([]),
    );

    expect(interactions).toHaveLength(1);
    expect(interactions[0]?.contractAddress).toBe(ROUTER);
  });

  test("does not fetch router receipts for blacklisted methods", async () => {
    const interactions = await extractDirectContractInteractions(
      {
        number: 100n,
        timestamp: 1000n,
        transactions: [
          tx(1, WATCHED_ONE, ROUTER, "0xa22cb4650000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001"),
        ],
      },
      buildWatchedAddressSet([WATCHED_ONE]),
      new Set(),
      async () => true,
      async () => ({
        methodSelector: "0xa22cb465",
        methodName: "setApprovalForAll",
      }),
      buildMethodBlacklist(["setApprovalForAll"]),
      buildWatchedAddressSet([ROUTER]),
      async () => {
        throw new Error("blacklisted router method should not fetch receipt");
      },
    );

    expect(interactions).toEqual([]);
  });

  test("rejects pending blocks without a block number", async () => {
    await expect(
      extractDirectContractInteractions(
        {
          number: null,
          timestamp: 1000n,
          transactions: [tx(1, WATCHED_ONE, CONTRACT)],
        },
        buildWatchedAddressSet([WATCHED_ONE]),
        new Set(),
        async () => true,
      ),
    ).rejects.toThrow("Cannot scan a pending block without a block number");
  });
});

function receipt(logs: readonly ScannableLog[]): ScannableTransactionReceipt {
  return {
    status: "success",
    logs,
  };
}

function erc721MintLog(contractAddress: Address, to: Address, tokenId = 1n): ScannableLog {
  return {
    address: contractAddress,
    topics: [
      ERC721_TRANSFER_TOPIC,
      ZERO_ADDRESS_TOPIC,
      addressTopic(to),
      quantityTopic(tokenId),
    ],
  };
}

function erc1155TransferSingleMintLog(contractAddress: Address, to: Address): ScannableLog {
  return {
    address: contractAddress,
    topics: [
      ERC1155_TRANSFER_SINGLE_TOPIC,
      addressTopic(CONTRACT),
      ZERO_ADDRESS_TOPIC,
      addressTopic(to),
    ],
  };
}

function erc1155TransferBatchMintLog(contractAddress: Address, to: Address): ScannableLog {
  return {
    address: contractAddress,
    topics: [
      ERC1155_TRANSFER_BATCH_TOPIC,
      addressTopic(CONTRACT),
      ZERO_ADDRESS_TOPIC,
      addressTopic(to),
    ],
  };
}

function addressTopic(address: Address): Hex {
  return `0x${address.slice(2).padStart(64, "0")}` as Hex;
}

function quantityTopic(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}

function tx(
  nonce: number,
  from: Address,
  to: Address | null,
  input: Hex = "0x40c10f190000000000000000000000000000000000000000000000000000000000000001",
): ScannableTransaction {
  return {
    hash: hash(nonce),
    from,
    to,
    input,
  };
}

function hash(nonce: number): Hash {
  return `0x${nonce.toString(16).padStart(64, "0")}` as Hash;
}
