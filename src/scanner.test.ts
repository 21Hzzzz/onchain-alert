import { describe, expect, test } from "bun:test";
import type { Address, Hash } from "viem";
import { buildWatchedAddressSet } from "./address.ts";
import { extractDirectContractInteractions, type ScannableTransaction } from "./scanner.ts";

const WATCHED_ONE = "0x0000000000000000000000000000000000000001" as Address;
const WATCHED_TWO = "0x0000000000000000000000000000000000000002" as Address;
const UNWATCHED = "0x0000000000000000000000000000000000000003" as Address;
const CONTRACT = "0x00000000000000000000000000000000000000aa" as Address;
const EOA = "0x00000000000000000000000000000000000000bb" as Address;

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

function tx(nonce: number, from: Address, to: Address | null): ScannableTransaction {
  return {
    hash: hash(nonce),
    from,
    to,
    input: "0x40c10f190000000000000000000000000000000000000000000000000000000000000001",
  };
}

function hash(nonce: number): Hash {
  return `0x${nonce.toString(16).padStart(64, "0")}` as Hash;
}
