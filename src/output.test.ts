import { describe, expect, test } from "bun:test";
import type { Address, Hash } from "viem";
import type { CollectiveInteractionAlert } from "./detector.ts";
import { formatAlertForConsole } from "./output.ts";

describe("formatAlertForConsole", () => {
  test("includes participant address details with remarks", () => {
    const alert: CollectiveInteractionAlert = {
      kind: "collective_contract_interaction",
      contractAddress: "0x00000000000000000000000000000000000000aa" as Address,
      windowSeconds: 300,
      minUniqueAddresses: 2,
      uniqueAddressCount: 2,
      participantAddresses: [
        "0x0000000000000000000000000000000000000001" as Address,
        "0x0000000000000000000000000000000000000002" as Address,
      ],
      participantAddressDetails: [
        {
          address: "0x0000000000000000000000000000000000000001" as Address,
          remark: "wallet one",
          methodNames: ["mint"],
          methodSelectors: ["0x40c10f19"],
          transactionHashes: [`0x${"1".padStart(64, "0")}` as Hash],
        },
        {
          address: "0x0000000000000000000000000000000000000002" as Address,
          methodNames: ["approve"],
          methodSelectors: ["0x095ea7b3"],
          transactionHashes: [`0x${"2".padStart(64, "0")}` as Hash],
        },
      ],
      transactionHashes: [
        `0x${"1".padStart(64, "0")}` as Hash,
        `0x${"2".padStart(64, "0")}` as Hash,
      ],
      openSeaUrl:
        "https://opensea.io/assets/ethereum/0x00000000000000000000000000000000000000aa",
      firstInteractionAt: "2026-01-01T00:00:00.000Z",
      latestInteractionAt: "2026-01-01T00:01:00.000Z",
      triggerBlockNumber: 123n,
      triggerBlockTimestamp: "2026-01-01T00:01:00.000Z",
    };

    const output = JSON.parse(formatAlertForConsole(alert));

    expect(output.participantAddressDetails).toEqual(alert.participantAddressDetails);
    expect(output.openSeaUrl).toBe(alert.openSeaUrl);
    expect(output.triggerBlockNumber).toBe("123");
  });
});
