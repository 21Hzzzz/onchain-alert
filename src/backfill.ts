export type BlockTimestampClient = {
  getBlock(args: { blockNumber: bigint; includeTransactions?: false }): Promise<{
    number: bigint | null;
    timestamp: bigint | number;
  }>;
};

export async function findBackfillStartBlock(
  client: BlockTimestampClient,
  latestBlockNumber: bigint,
  windowSeconds: number,
): Promise<bigint> {
  if (latestBlockNumber < 0n) {
    throw new Error("latestBlockNumber cannot be negative");
  }

  const latestBlock = await client.getBlock({
    blockNumber: latestBlockNumber,
    includeTransactions: false,
  });
  const targetTimestamp = Number(latestBlock.timestamp) - windowSeconds;

  let low = 0n;
  let high = latestBlockNumber;

  while (low < high) {
    const mid = (low + high) / 2n;
    const block = await client.getBlock({
      blockNumber: mid,
      includeTransactions: false,
    });

    if (Number(block.timestamp) < targetTimestamp) {
      low = mid + 1n;
    } else {
      high = mid;
    }
  }

  return low;
}
