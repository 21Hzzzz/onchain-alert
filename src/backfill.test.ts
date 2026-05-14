import { describe, expect, test } from "bun:test";
import { findBackfillStartBlock, type BlockTimestampClient } from "./backfill.ts";

describe("findBackfillStartBlock", () => {
  test("finds the first block inside the requested time window", async () => {
    const client = fakeTimestampClient((blockNumber) => 1000 + Number(blockNumber) * 12);

    const startBlock = await findBackfillStartBlock(client, 10n, 36);

    expect(startBlock).toBe(7n);
  });

  test("returns genesis when the whole chain is inside the requested window", async () => {
    const client = fakeTimestampClient((blockNumber) => 10 + Number(blockNumber) * 12);

    const startBlock = await findBackfillStartBlock(client, 10n, 300);

    expect(startBlock).toBe(0n);
  });
});

function fakeTimestampClient(timestampForBlock: (blockNumber: bigint) => number): BlockTimestampClient {
  return {
    async getBlock({ blockNumber }) {
      return {
        number: blockNumber,
        timestamp: BigInt(timestampForBlock(blockNumber)),
      };
    },
  };
}
