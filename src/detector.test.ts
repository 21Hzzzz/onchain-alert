import { describe, expect, test } from "bun:test";
import type { Address, Hash } from "viem";
import { CollectiveInteractionDetector, type InteractionEvent } from "./detector.ts";

const CONTRACT = "0x00000000000000000000000000000000000000aa" as Address;
const ADDRESS_ONE = "0x0000000000000000000000000000000000000001" as Address;
const ADDRESS_TWO = "0x0000000000000000000000000000000000000002" as Address;
const ADDRESS_THREE = "0x0000000000000000000000000000000000000003" as Address;

describe("CollectiveInteractionDetector", () => {
  test("alerts when enough unique watched addresses interact with one contract", () => {
    const detector = new CollectiveInteractionDetector({
      windowSeconds: 300,
      minUniqueAddresses: 2,
      addressRemarks: new Map([[ADDRESS_ONE.toLowerCase(), "wallet one"]]),
    });

    const alerts = detector.recordInteractions(
      [event(ADDRESS_ONE, 1000, 1), event(ADDRESS_TWO, 1010, 2)],
      1010,
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.contractAddress).toBe(CONTRACT);
    expect(alerts[0]?.uniqueAddressCount).toBe(2);
    expect(alerts[0]?.participantAddresses).toEqual([ADDRESS_ONE, ADDRESS_TWO]);
    expect(alerts[0]?.participantAddressDetails).toEqual([
      {
        address: ADDRESS_ONE,
        remark: "wallet one",
        methodNames: ["mint"],
        methodSelectors: ["0x40c10f19"],
        transactionHashes: [hash(1)],
      },
      {
        address: ADDRESS_TWO,
        methodNames: ["approve"],
        methodSelectors: ["0x095ea7b3"],
        transactionHashes: [hash(2)],
      },
    ]);
    expect(alerts[0]?.transactionHashes).toEqual([hash(1), hash(2)]);
  });

  test("does not alert again for the same participant set", () => {
    const detector = new CollectiveInteractionDetector({
      windowSeconds: 300,
      minUniqueAddresses: 2,
    });

    detector.recordInteractions([event(ADDRESS_ONE, 1000, 1), event(ADDRESS_TWO, 1010, 2)], 1010);

    const alerts = detector.recordInteractions([event(ADDRESS_ONE, 1020, 3)], 1020);

    expect(alerts).toHaveLength(0);
  });

  test("alerts again when a new watched address joins the active window", () => {
    const detector = new CollectiveInteractionDetector({
      windowSeconds: 300,
      minUniqueAddresses: 2,
    });

    detector.recordInteractions([event(ADDRESS_ONE, 1000, 1), event(ADDRESS_TWO, 1010, 2)], 1010);

    const alerts = detector.recordInteractions([event(ADDRESS_THREE, 1020, 3)], 1020);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.uniqueAddressCount).toBe(3);
    expect(alerts[0]?.participantAddresses).toEqual([ADDRESS_ONE, ADDRESS_TWO, ADDRESS_THREE]);
  });

  test("suppresses repeat alerts for the same contract during cooldown", () => {
    const detector = new CollectiveInteractionDetector({
      windowSeconds: 300,
      alertCooldownSeconds: 120,
      minUniqueAddresses: 2,
    });

    detector.recordInteractions([event(ADDRESS_ONE, 1000, 1), event(ADDRESS_TWO, 1010, 2)], 1010);

    const alerts = detector.recordInteractions([event(ADDRESS_THREE, 1020, 3)], 1020);

    expect(alerts).toHaveLength(0);
  });

  test("alerts again for the same contract after cooldown when a new address joins", () => {
    const detector = new CollectiveInteractionDetector({
      windowSeconds: 300,
      alertCooldownSeconds: 60,
      minUniqueAddresses: 2,
    });

    detector.recordInteractions([event(ADDRESS_ONE, 1000, 1), event(ADDRESS_TWO, 1010, 2)], 1010);
    detector.recordInteractions([event(ADDRESS_THREE, 1020, 3)], 1020);

    const alerts = detector.recordInteractions([event(ADDRESS_THREE, 1080, 4)], 1080);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.uniqueAddressCount).toBe(3);
  });

  test("resets alert state after the active window falls below the threshold", () => {
    const detector = new CollectiveInteractionDetector({
      windowSeconds: 100,
      minUniqueAddresses: 2,
    });

    detector.recordInteractions([event(ADDRESS_ONE, 100, 1), event(ADDRESS_TWO, 110, 2)], 110);
    detector.prune(250);

    const alerts = detector.recordInteractions(
      [event(ADDRESS_ONE, 260, 3), event(ADDRESS_TWO, 270, 4)],
      270,
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.transactionHashes).toEqual([hash(3), hash(4)]);
  });

  test("counts unique addresses, not transaction count", () => {
    const detector = new CollectiveInteractionDetector({
      windowSeconds: 300,
      minUniqueAddresses: 2,
    });

    const alerts = detector.recordInteractions(
      [event(ADDRESS_ONE, 1000, 1), event(ADDRESS_ONE, 1005, 2), event(ADDRESS_TWO, 1010, 3)],
      1010,
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.uniqueAddressCount).toBe(2);
    expect(alerts[0]?.transactionHashes).toEqual([hash(1), hash(2), hash(3)]);
  });

  test("carries the latest OpenSea URL into the alert", () => {
    const detector = new CollectiveInteractionDetector({
      windowSeconds: 300,
      minUniqueAddresses: 2,
    });
    const openSeaUrl =
      "https://opensea.io/assets/ethereum/0x00000000000000000000000000000000000000aa";

    const alerts = detector.recordInteractions(
      [
        event(ADDRESS_ONE, 1000, 1),
        {
          ...event(ADDRESS_TWO, 1010, 2),
          openSeaUrl,
        },
        event(ADDRESS_THREE, 1020, 3),
      ],
      1020,
    );

    expect(alerts[0]?.openSeaUrl).toBe(openSeaUrl);
  });
});

function event(from: Address, timestamp: number, nonce: number): InteractionEvent {
  const methodSelector = nonce % 2 === 0 ? "0x095ea7b3" : "0x40c10f19";
  const methodName = nonce % 2 === 0 ? "approve" : "mint";

  return {
    contractAddress: CONTRACT,
    from,
    transactionHash: hash(nonce),
    methodSelector,
    methodName,
    blockNumber: BigInt(nonce),
    timestamp,
  };
}

function hash(nonce: number): Hash {
  return `0x${nonce.toString(16).padStart(64, "0")}` as Hash;
}
